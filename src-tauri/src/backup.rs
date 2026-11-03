//! Copies of the database. They run in `setup()` before the database is opened, so the files are not in use and a
//! plain copy is complete. The database runs in WAL mode: recent changes can sit in the `-wal` file, so both are copied.
use std::fs;
use std::path::{Path, PathBuf};
#[cfg(test)]
use std::time::Duration;

use chrono::Local;

pub const DB_FILE: &str = "darttrainer.db";
const LAST_VERSION_FILE: &str = "last-version";
/// How many update backups are kept (a version change). The daily ones have their own count.
const KEEP_UPDATE: usize = 3;
const KEEP_DAILY: usize = 5;

pub fn backups_dir(config: &Path) -> PathBuf {
    config.join("backups")
}

pub fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// Copies `darttrainer.db` and its `-wal` file into `dest`. Nothing to copy (a new install) is not an error.
pub fn copy_database(config: &Path, dest: &Path) -> Result<bool, String> {
    let db = config.join(DB_FILE);
    if !db.exists() {
        return Ok(false);
    }
    fs::create_dir_all(dest).map_err(|e| format!("{}: {e}", dest.display()))?;
    for name in [DB_FILE.to_string(), format!("{DB_FILE}-wal")] {
        let from = config.join(&name);
        if from.exists() {
            fs::copy(&from, dest.join(&name)).map_err(|e| format!("{}: {e}", from.display()))?;
        }
    }
    Ok(true)
}

/// Keeps the newest `keep` folders in `dir` (folder names start with a date or version, so name order is age order
/// within one kind of backup; modified time decides across them). Older ones are deleted.
pub fn prune(dir: &Path, keep: usize) {
    let Ok(read) = fs::read_dir(dir) else { return };
    let mut folders: Vec<(std::time::SystemTime, PathBuf)> = read
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    folders.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in folders.into_iter().skip(keep) {
        let _ = fs::remove_dir_all(path);
    }
}

/// The daily backup: the first start of each day, last 5 kept. Returns the folder if one was made.
pub fn daily_backup(config: &Path) -> Result<Option<PathBuf>, String> {
    let dest = backups_dir(config).join("daily").join(today());
    if dest.exists() {
        return Ok(None);
    }
    match copy_database(config, &dest) {
        Ok(true) => {
            prune(&backups_dir(config).join("daily"), KEEP_DAILY);
            Ok(Some(dest))
        }
        Ok(false) => Ok(None),
        Err(e) => {
            // A half-copied folder would pass for today's backup and block the retry on the next start.
            let _ = fs::remove_dir_all(&dest);
            Err(e)
        }
    }
}

/// When the newest backup of any kind was made, as RFC 3339 local time.
pub fn last_backup(config: &Path) -> Option<String> {
    let mut newest: Option<std::time::SystemTime> = None;
    for kind in ["daily", "update"] {
        let Ok(read) = fs::read_dir(backups_dir(config).join(kind)) else { continue };
        for e in read.flatten().filter(|e| e.path().is_dir()) {
            if let Ok(m) = e.metadata().and_then(|m| m.modified()) {
                newest = Some(newest.map_or(m, |n| n.max(m)));
            }
        }
    }
    newest.map(|t| chrono::DateTime::<Local>::from(t).to_rfc3339())
}

/// Backup when the app version differs from the last run, before the migrations of the new version run.
/// Writes the current version afterwards. Returns the backup folder if one was made.
pub fn update_backup(config: &Path, version: &str) -> Result<Option<PathBuf>, String> {
    let marker = config.join(LAST_VERSION_FILE);
    let old = fs::read_to_string(&marker).ok().map(|s| s.trim().to_string());
    if old.as_deref() == Some(version) {
        return Ok(None);
    }
    let dest = backups_dir(config)
        .join("update")
        .join(format!("{}-{}", old.as_deref().unwrap_or("unknown"), today()));
    let made = copy_database(config, &dest);
    // Remember the version even if the copy failed: it is retried by the daily backup, and a failing copy
    // shouldn't turn into a copy attempt on every start.
    fs::create_dir_all(config).ok();
    let _ = fs::write(&marker, version);
    match made {
        Ok(true) => {
            prune(&backups_dir(config).join("update"), KEEP_UPDATE);
            Ok(Some(dest))
        }
        Ok(false) => Ok(None),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("d3-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn copies_the_database_and_its_wal() {
        let cfg = temp("copy");
        fs::write(cfg.join(DB_FILE), "db").unwrap();
        fs::write(cfg.join(format!("{DB_FILE}-wal")), "wal").unwrap();
        let dest = cfg.join("out");
        assert!(copy_database(&cfg, &dest).unwrap());
        assert_eq!(fs::read_to_string(dest.join(DB_FILE)).unwrap(), "db");
        assert_eq!(fs::read_to_string(dest.join(format!("{DB_FILE}-wal"))).unwrap(), "wal");
    }

    #[test]
    fn a_new_install_has_nothing_to_back_up() {
        let cfg = temp("new");
        assert!(!copy_database(&cfg, &cfg.join("out")).unwrap());
        assert!(update_backup(&cfg, "1.0.0").unwrap().is_none());
        assert_eq!(fs::read_to_string(cfg.join("last-version")).unwrap(), "1.0.0");
    }

    #[test]
    fn backs_up_only_when_the_version_changes() {
        let cfg = temp("version");
        fs::write(cfg.join(DB_FILE), "db").unwrap();
        fs::write(cfg.join("last-version"), "0.9.0").unwrap();
        let dir = update_backup(&cfg, "1.0.0").unwrap().expect("a backup");
        assert!(dir.to_string_lossy().contains("0.9.0-"));
        assert!(dir.join(DB_FILE).exists());
        assert!(update_backup(&cfg, "1.0.0").unwrap().is_none());
    }

    #[test]
    fn one_daily_backup_per_day() {
        let cfg = temp("daily");
        fs::write(cfg.join(DB_FILE), "db").unwrap();
        let first = daily_backup(&cfg).unwrap().expect("a backup");
        assert!(first.join(DB_FILE).exists());
        assert!(daily_backup(&cfg).unwrap().is_none());
        assert!(last_backup(&cfg).is_some());
    }

    #[test]
    fn prune_keeps_the_newest() {
        let cfg = temp("prune");
        for i in 0..5 {
            fs::create_dir_all(cfg.join(format!("b{i}"))).unwrap();
            std::thread::sleep(Duration::from_millis(20));
        }
        prune(&cfg, 2);
        let left: Vec<_> = fs::read_dir(&cfg).unwrap().flatten().collect();
        assert_eq!(left.len(), 2);
        assert!(cfg.join("b4").exists() && cfg.join("b3").exists());
    }
}
