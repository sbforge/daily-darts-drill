#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::{Duration, Instant};

use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::Serialize;
use tauri::Manager;

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        // Size, position and maximised state are remembered, so the player sets the window up once at the oche.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            // The first start fits the screen: on a small one (a 1366 x 768 laptop at 125 %) the 1100 x 760 window
            // would be taller than the screen and can't be made smaller, so it opens maximised instead.
            // Once the window state plugin has saved a state, that state wins.
            let saved = app.path().app_config_dir().map(|d| d.join(".window-state.json").exists()).unwrap_or(false);
            if !saved {
                if let Some(win) = app.get_webview_window("main") {
                    if let Ok(Some(monitor)) = win.current_monitor() {
                        let area = monitor.work_area();
                        let scale = monitor.scale_factor();
                        let (w, h) = (area.size.width as f64 / scale, area.size.height as f64 / scale);
                        if w < 1100.0 || h < 760.0 {
                            let _ = win.maximize();
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![discover_boards])
        .run(tauri::generate_context!())
        .expect("error while running D³ – Daily Darts Drill");
}
