#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup;

use std::path::PathBuf;
use std::time::{Duration, Instant};

use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::Serialize;
use tauri::{Manager, State};
use tauri_plugin_sql::{Migration, MigrationKind};

/// Every schema change is a new file here and a new line below. Never edit or delete a released one.
fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "baseline",
        sql: include_str!("../migrations/0001_baseline.sql"),
        kind: MigrationKind::Up,
    }]
}

/// What happened before the window opened, for the app to show.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct Startup {
    /// A backup taken because the app version changed.
    update_backup: Option<String>,
    /// Today's backup, if this start made it.
    daily_backup: Option<String>,
    /// Why a backup failed, if it did.
    backup_error: Option<String>,
}

#[tauri::command]
fn startup_report(startup: State<'_, Startup>) -> &Startup {
    startup.inner()
}

/// When the newest backup was made.
#[tauri::command]
fn last_backup(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(backup::last_backup(&config))
}

/// Opens one of the app's folders in the file manager.
#[tauri::command]
fn open_folder(app: tauri::AppHandle, kind: String) -> Result<(), String> {
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let path: PathBuf = match kind.as_str() {
        "backups" => backup::backups_dir(&config),
        "logs" => app.path().app_log_dir().map_err(|e| e.to_string())?,
        _ => return Err(format!("unknown folder: {kind}")),
    };
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// The service type the Autodarts client announces on the local network.
const AUTODARTS_SERVICE: &str = "_autodarts-board._tcp.local.";

/// An Autodarts client found on the local network.
#[derive(Serialize)]
struct Board {
    id: String,
    name: String,
    host: String,
    port: u16,
    cams: Option<u32>,
}

/// Listens for Autodarts clients for a few seconds and returns the ones that answered.
#[tauri::command]
async fn discover_boards(timeout_ms: Option<u64>) -> Result<Vec<Board>, String> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(3000).min(10_000));
    tauri::async_runtime::spawn_blocking(move || browse(timeout))
        .await
        .map_err(|e| e.to_string())?
}

fn browse(timeout: Duration) -> Result<Vec<Board>, String> {
    let mdns = ServiceDaemon::new().map_err(|e| e.to_string())?;
    let events = mdns.browse(AUTODARTS_SERVICE).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + timeout;
    let mut boards: Vec<Board> = Vec::new();

    while let Some(left) = deadline.checked_duration_since(Instant::now()) {
        let Ok(event) = events.recv_timeout(left) else { break };
        let ServiceEvent::ServiceResolved(info) = event else { continue };

        // The client puts the address it wants to be reached at into the TXT record;
        // the resolved addresses and the .local name (not resolvable everywhere) are fallbacks.
        let hostname = info.get_hostname().trim_end_matches('.').to_string();
        let host = info
            .get_property_val_str("ip")
            .map(str::to_string)
            .or_else(|| info.get_addresses_v4().iter().min().map(|ip| ip.to_string()))
            .unwrap_or_else(|| hostname.clone());
        let board = Board {
            id: info.get_property_val_str("id").unwrap_or(info.get_fullname()).to_string(),
            name: hostname.trim_end_matches(".local").to_string(),
            host,
            port: info.get_port(),
            cams: info.get_property_val_str("cams").and_then(|c| c.parse().ok()),
        };
        // The same client can answer once per network interface.
        if !boards.iter().any(|b| b.id == board.id) {
            boards.push(board);
        }
    }

    let _ = mdns.shutdown();
    Ok(boards)
}

/// The log: `d3.log` in the app's log folder, about 1 MB each, the last 3 kept. Also on stdout in development.
fn logger() -> tauri_plugin_log::Builder {
    use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
    tauri_plugin_log::Builder::new()
        .targets([
            Target::new(TargetKind::LogDir { file_name: Some("d3".into()) }),
            Target::new(TargetKind::Stdout),
        ])
        .max_file_size(1_000_000)
        .rotation_strategy(RotationStrategy::KeepSome(3))
        .level(if cfg!(debug_assertions) { log::LevelFilter::Debug } else { log::LevelFilter::Info })
}

fn main() {
    // A panic on the main thread ends the app: write it down first, so the next start can say so.
    std::panic::set_hook(Box::new(|info| {
        log::error!("panic: {info}");
    }));
    tauri::Builder::default()
        .plugin(logger().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:darttrainer.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Before any window can open the database: the files are not in use, a plain copy is complete.
            let config = app.path().app_config_dir()?;
            log::info!("D³ {} on {} starting", env!("CARGO_PKG_VERSION"), std::env::consts::OS);
            let mut startup = Startup::default();
            match backup::update_backup(&config, env!("CARGO_PKG_VERSION")) {
                Ok(Some(dir)) => {
                    log::info!("backup before the update: {}", dir.display());
                    startup.update_backup = Some(dir.display().to_string());
                }
                Ok(None) => {}
                Err(e) => {
                    log::error!("backup before the update failed: {e}");
                    startup.backup_error = Some(e);
                }
            }
            // One backup step for all reasons, each with its own folder and count.
            match backup::daily_backup(&config) {
                Ok(Some(dir)) => {
                    log::info!("daily backup: {}", dir.display());
                    startup.daily_backup = Some(dir.display().to_string());
                }
                Ok(None) => {}
                Err(e) => {
                    log::error!("daily backup failed: {e}");
                    startup.backup_error = Some(e);
                }
            }
            app.manage(startup);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![discover_boards, startup_report, last_backup, open_folder])
        .run(tauri::generate_context!())
        .expect("error while running D³ – Daily Darts Drill");
}
