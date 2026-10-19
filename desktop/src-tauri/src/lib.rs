use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition,
};

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
