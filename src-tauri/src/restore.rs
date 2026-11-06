//! Restoring a backup or an export. The database is open while the app runs, so it happens in two steps:
//! `stage` copies the chosen file into `restore-pending/` and checks it there, the app restarts, and `apply_pending`
//! puts it in place in `setup()`, before the database opens. The data it replaces is copied to `backups/restore/`
//! first, so a restore can be undone the same way.
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::backup::{backups_dir, copy_database, prune, today, DB_FILE};

const PENDING_DIR: &str = "restore-pending";
const KEEP_RESTORE: usize = 3;
/// The first 16 bytes of every SQLite database file.
const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";

fn pending_dir(config: &Path) -> PathBuf {
    config.join(PENDING_DIR)
}

/// One backup the player can restore.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    /// daily, update, erase or restore (the data replaced by an earlier restore).
    pub kind: String,
    /// The folder name: a date, or a version and a date.
    pub name: String,
    /// The database file.
    pub path: String,
    /// When the backup was made, RFC 3339 local time.
    pub made: String,
}

/// Every backup with a database in it, newest first.
pub fn list(config: &Path) -> Vec<BackupEntry> {
    let mut out: Vec<(std::time::SystemTime, BackupEntry)> = vec![];
    for kind in ["daily", "update", "erase", "restore"] {
        let Ok(read) = fs::read_dir(backups_dir(config).join(kind)) else { continue };
        for e in read.flatten() {
            let db = e.path().join(DB_FILE);
            let Ok(modified) = fs::metadata(&db).and_then(|m| m.modified()) else { continue };
            out.push((
                modified,
                BackupEntry {
                    kind: kind.to_string(),
                    name: e.file_name().to_string_lossy().into_owned(),
                    path: db.display().to_string(),
                    made: chrono::DateTime::<chrono::Local>::from(modified).to_rfc3339(),
                },
            ));
        }
    }
    out.sort_by(|a, b| b.0.cmp(&a.0));
    out.into_iter().map(|(_, e)| e).collect()
}

/// Why a file can't be restored, in words the app maps to its own texts.
#[derive(Debug, PartialEq)]
pub enum StageError {
    /// Not a SQLite file at all.
    NotADatabase,
    /// A SQLite file, but not one D³ wrote (no migrations table).
    NotD3,
    /// Written by a newer D³: it has migrations this version doesn't know.
    Newer(i64),
    Io(String),
}

impl std::fmt::Display for StageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StageError::NotADatabase => write!(f, "notADatabase"),
            StageError::NotD3 => write!(f, "notD3"),
            StageError::Newer(v) => write!(f, "newer:{v}"),
            StageError::Io(e) => write!(f, "io:{e}"),
        }
    }
}

fn io(e: impl std::fmt::Display) -> StageError {
    StageError::Io(e.to_string())
}

/// The highest migration a database has, or None when it has no migrations table.
fn schema_version(db: &Path) -> Result<Option<i64>, StageError> {
    let conn = rusqlite::Connection::open_with_flags(db, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE).map_err(io)?;
    let has_table: bool = conn
        .query_row("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'", [], |r| {
            r.get::<_, i64>(0)
        })
        .map_err(|_| StageError::NotADatabase)?
        > 0;
    if !has_table {
        return Ok(None);
    }
    conn.query_row("SELECT coalesce(max(version), 0) FROM _sqlx_migrations", [], |r| r.get(0))
        .map(Some)
        .map_err(io)
}

/// Copies `source` (and its `-wal` file, if there is one) into `restore-pending/` and checks the copy: a SQLite file
/// with D³'s migrations, none newer than `known` (the newest migration of this version). The copy is opened, not the
/// source, so a backup is never changed. A failed check removes the copy again.
pub fn stage(config: &Path, source: &Path, known: i64) -> Result<(), StageError> {
    let mut header = [0u8; 16];
    {
        use std::io::Read;
        let mut f = fs::File::open(source).map_err(io)?;
        if f.read_exact(&mut header).is_err() || &header != SQLITE_HEADER {
            return Err(StageError::NotADatabase);
        }
    }
    let pending = pending_dir(config);
    let _ = fs::remove_dir_all(&pending);
    fs::create_dir_all(&pending).map_err(io)?;
    let result = (|| {
        fs::copy(source, pending.join(DB_FILE)).map_err(io)?;
        let wal = PathBuf::from(format!("{}-wal", source.display()));
        if wal.exists() {
            fs::copy(&wal, pending.join(format!("{DB_FILE}-wal"))).map_err(io)?;
        }
        match schema_version(&pending.join(DB_FILE))? {
            None => Err(StageError::NotD3),
            Some(v) if v > known => Err(StageError::Newer(v)),
            Some(_) => Ok(()),
        }
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&pending);
    }
    result
}

/// Drops a staged restore (the player cancelled the restart).
pub fn discard(config: &Path) {
    let _ = fs::remove_dir_all(pending_dir(config));
}

/// Puts a staged restore in place. Called in `setup()` before the database opens. The current data goes to
/// `backups/restore/<date>-<time>/` first (last 3 kept). Returns that folder if a restore was applied.
pub fn apply_pending(config: &Path) -> Result<Option<PathBuf>, String> {
    let pending = pending_dir(config);
    let staged = pending.join(DB_FILE);
    if !staged.exists() {
        return Ok(None);
    }
    let time = chrono::Local::now().format("%H%M%S");
    let saved = backups_dir(config).join("restore").join(format!("{}-{time}", today()));
    copy_database(config, &saved)?;
    prune(&backups_dir(config).join("restore"), KEEP_RESTORE);
    for name in [DB_FILE.to_string(), format!("{DB_FILE}-wal"), format!("{DB_FILE}-shm")] {
        let p = config.join(&name);
        if p.exists() {
            fs::remove_file(&p).map_err(|e| format!("{}: {e}", p.display()))?;
        }
    }
    for name in [DB_FILE.to_string(), format!("{DB_FILE}-wal")] {
        let from = pending.join(&name);
        if from.exists() {
            fs::copy(&from, config.join(&name)).map_err(|e| format!("{}: {e}", from.display()))?;
        }
    }
    let _ = fs::remove_dir_all(&pending);
    Ok(Some(saved))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("d3-restore-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A database like D³'s: the migrations table up to `version`, and one setting to tell copies apart.
    fn make_db(path: &Path, version: i64, marker: &str) {
        let _ = fs::remove_file(path);
        let c = rusqlite::Connection::open(path).unwrap();
        c.execute_batch("CREATE TABLE _sqlx_migrations (version BIGINT PRIMARY KEY); CREATE TABLE settings (key TEXT, value TEXT);")
            .unwrap();
        for v in 1..=version {
            c.execute("INSERT INTO _sqlx_migrations VALUES (?1)", [v]).unwrap();
        }
        c.execute("INSERT INTO settings VALUES ('marker', ?1)", [marker]).unwrap();
    }

    fn marker(path: &Path) -> String {
        let c = rusqlite::Connection::open(path).unwrap();
        c.query_row("SELECT value FROM settings WHERE key = 'marker'", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn stages_and_applies_a_backup() {
        let config = temp("apply");
        make_db(&config.join(DB_FILE), 1, "current");
        let source = config.join("export.db");
        make_db(&source, 1, "backup");

        stage(&config, &source, 1).unwrap();
        assert_eq!(marker(&config.join(DB_FILE)), "current", "nothing changes before the restart");

        let saved = apply_pending(&config).unwrap().expect("a restore was applied");
        assert_eq!(marker(&config.join(DB_FILE)), "backup");
        assert_eq!(marker(&saved.join(DB_FILE)), "current", "the replaced data is kept");
        assert!(!pending_dir(&config).exists());
        assert_eq!(apply_pending(&config).unwrap(), None, "only once");
        assert_eq!(list(&config).iter().filter(|e| e.kind == "restore").count(), 1);
    }

    #[test]
    fn refuses_what_isnt_a_d3_database() {
        let config = temp("refuse");
        let text = config.join("notes.db");
        fs::write(&text, "hello, this is not a database at all").unwrap();
        assert_eq!(stage(&config, &text, 1), Err(StageError::NotADatabase));

        let other = config.join("other.db");
        rusqlite::Connection::open(&other).unwrap().execute_batch("CREATE TABLE t (x);").unwrap();
        assert_eq!(stage(&config, &other, 1), Err(StageError::NotD3));

        let newer = config.join("newer.db");
        make_db(&newer, 3, "newer");
        assert_eq!(stage(&config, &newer, 1), Err(StageError::Newer(3)));
        assert!(!pending_dir(&config).exists(), "a refused file leaves nothing behind");
    }

    #[test]
    fn lists_backups_newest_first() {
        let config = temp("list");
        for (kind, name) in [("daily", "2026-11-01"), ("update", "0.9.7-2026-11-05")] {
            let dir = backups_dir(&config).join(kind).join(name);
            fs::create_dir_all(&dir).unwrap();
            make_db(&dir.join(DB_FILE), 1, name);
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        fs::create_dir_all(backups_dir(&config).join("daily").join("empty")).unwrap();
        let names: Vec<String> = list(&config).into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["0.9.7-2026-11-05", "2026-11-01"]);
    }
}
