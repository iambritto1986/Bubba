mod skills;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition,
};

/// Folder holding the character videos (copied next to bubba.exe by "Build and start Bubba.bat";
/// they're too big to embed in the exe). The webview loads them through the asset protocol.
#[tauri::command]
fn media_root(app: AppHandle) -> Result<String, String> {
    let dir = app.path().resource_dir().map_err(|e| e.to_string())?.join("media");
    Ok(dir.to_string_lossy().into_owned())
}

fn show_bubba(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            skills::open_url,
            skills::open_folder,
            skills::launch_app,
            skills::read_clipboard,
            skills::write_clipboard,
            skills::active_window,
            media_root,
        ])
        .setup(|app| {
            // Tray icon: the way back when Bubba is hidden, and the way to quit.
            let show = MenuItem::with_id(app, "show", "Show Bubba", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Bubba", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("app icon").clone())
                .tooltip("Bubba")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_bubba(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_bubba(tray.app_handle());
                    }
                })
                .build(app)?;

            // Start in the bottom-right corner, above the taskbar.
            if let Some(win) = app.get_webview_window("main") {
                if let (Ok(Some(monitor)), Ok(size)) = (win.current_monitor(), win.outer_size()) {
                    let area = monitor.work_area();
                    let margin = (24.0 * monitor.scale_factor()) as i32;
                    let x = area.position.x + area.size.width as i32 - size.width as i32 - margin;
                    let y = area.position.y + area.size.height as i32 - size.height as i32 - margin;
                    let _ = win.set_position(PhysicalPosition::new(x, y));
                }
                let _ = win.show();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Bubba");
}
