//! Bubba's "hands": the few things the companion may do on the user's PC.
//!
//! Everything here is deliberately narrow. The voice agent (an LLM) chooses *what* to open, so
//! nothing it sends is ever passed to a shell: websites and app protocols go through an allowlist
//! of URL schemes, folders are a fixed set of the user's own known folders, and desktop apps are a
//! fixed table of executables. No command line is ever built from model output.

use serde::Serialize;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// URL schemes Bubba may open (browser links, mail, and well-known app protocols).
const ALLOWED_SCHEMES: &[&str] = &[
    "http", "https", "mailto",
    "spotify", "vscode", "msteams", "zoommtg", "slack", "discord", "whatsapp", "notion",
    "ms-settings", "ms-word", "ms-excel", "ms-powerpoint", "ms-outlook", "outlook", "ms-clock",
    "ms-photos", "ms-windows-store", "ms-todo", "calculator", "microsoft-edge",
    "ms-screenclip", "ms-whiteboard-cmd", "onenote",
];

fn spawn_hidden(cmd: &mut Command) -> Result<(), String> {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Hand a URL / app protocol to Windows (it opens in the default browser / registered app).
fn shell_open(target: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        // explorer.exe <url> asks the shell to open it; the argument is a single argv entry,
        // never parsed by cmd.exe, so characters like & or | can't chain commands.
        spawn_hidden(Command::new("explorer.exe").arg(target))
    }
    #[cfg(not(windows))]
    {
        spawn_hidden(Command::new("xdg-open").arg(target))
    }
}

/// Open a website or an app link such as `spotify:` or `ms-settings:display`.
#[tauri::command]
pub fn open_url(url: String) -> Result<String, String> {
    let url = url.trim();
    let mut url = url.to_string();
    if !url.contains(':') {
        url = format!("https://{url}"); // "youtube.com" -> https://youtube.com
    }
    let scheme = url.split(':').next().unwrap_or("").to_ascii_lowercase();
    if !ALLOWED_SCHEMES.contains(&scheme.as_str()) {
        return Err(format!("I'm not allowed to open '{scheme}:' links."));
    }
    if url.len() > 2048 || url.chars().any(|c| c.is_control()) {
        return Err("That link looks malformed.".into());
    }
    shell_open(&url)?;
    Ok(format!("Opened {url}"))
}

/// Open one of the user's own known folders in File Explorer.
#[tauri::command]
pub fn open_folder(folder: String) -> Result<String, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "I can't find your home folder.".to_string())?;
    let sub = match folder.trim().to_ascii_lowercase().as_str() {
        "home" | "user" | "profile" => "",
        "desktop" => "Desktop",
        "documents" | "docs" | "my documents" => "Documents",
        "downloads" | "download" => "Downloads",
        "pictures" | "photos" | "images" => "Pictures",
        "music" => "Music",
        "videos" | "movies" => "Videos",
        other => return Err(format!("I only know your Desktop, Documents, Downloads, Pictures, Music and Videos folders, not '{other}'.")),
    };
    let mut path = std::path::PathBuf::from(&home);
    if !sub.is_empty() {
        path.push(sub);
        // OneDrive often moves Desktop/Documents/Pictures
        if !path.exists() {
            let od = std::path::PathBuf::from(&home).join("OneDrive").join(sub);
            if od.exists() {
                path = od;
            }
        }
    }
    #[cfg(windows)]
    {
        spawn_hidden(Command::new("explorer.exe").arg(&path))?;
    }
    #[cfg(not(windows))]
    {
        spawn_hidden(Command::new("xdg-open").arg(&path))?;
    }
    Ok(format!("Opened {}", path.display()))
}

/// Start one of a fixed set of desktop programs that have no URL protocol.
#[tauri::command]
pub fn launch_app(app: String) -> Result<String, String> {
    let exe = match app.trim().to_ascii_lowercase().as_str() {
        "notepad" => "notepad.exe",
        "paint" | "mspaint" => "mspaint.exe",
        "calculator" | "calc" => "calc.exe",
        "file explorer" | "explorer" | "files" => "explorer.exe",
        "snipping tool" | "snip" => "SnippingTool.exe",
        "task manager" => "taskmgr.exe",
        "wordpad" => "write.exe",
        other => return Err(format!("I don't know how to start '{other}' yet.")),
    };
    spawn_hidden(&mut Command::new(exe))?;
    Ok(format!("Started {app}"))
}

/// Read the text currently on the clipboard (for "summarise what I copied").
#[tauri::command]
pub fn read_clipboard() -> Result<String, String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let text = cb.get_text().map_err(|_| "There's no text on the clipboard.".to_string())?;
    // keep the agent's context small
    Ok(text.chars().take(6000).collect())
}

/// Put text on the clipboard (drafts, replies, lists) so the user can paste it anywhere.
#[tauri::command]
pub fn write_clipboard(text: String) -> Result<String, String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())?;
    Ok("Copied to your clipboard.".into())
}

#[derive(Serialize, Default)]
pub struct ActiveWindow {
    pub title: String,
    pub app: String,
}

/// Which app/window the user is in right now (title + executable name). Local only; no screenshots.
#[tauri::command]
pub fn active_window() -> ActiveWindow {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Foundation::{CloseHandle, MAX_PATH};
        use windows_sys::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
        };

        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return ActiveWindow::default();
        }
        let len = GetWindowTextLengthW(hwnd);
        let mut buf = vec![0u16; (len as usize) + 1];
        let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        let title = String::from_utf16_lossy(&buf[..n.max(0) as usize]);

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let mut app = String::new();
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if !h.is_null() {
            let mut path = vec![0u16; MAX_PATH as usize * 2];
            let mut size = path.len() as u32;
            if QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, path.as_mut_ptr(), &mut size) != 0 {
                let full = String::from_utf16_lossy(&path[..size as usize]);
                app = full.rsplit(['\\', '/']).next().unwrap_or("").to_string();
            }
            CloseHandle(h);
        }
        ActiveWindow { title, app }
    }
    #[cfg(not(windows))]
    {
        ActiveWindow::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unknown_schemes() {
        assert!(open_url("file:///C:/Windows/System32/cmd.exe".into()).is_err());
        assert!(open_url("javascript:alert(1)".into()).is_err());
        assert!(open_url("ms-msdt:/id".into()).is_err());
    }
    #[test]
    fn unknown_app_and_folder_rejected() {
        assert!(launch_app("powershell".into()).is_err());
        assert!(open_folder("C:\\Windows".into()).is_err());
    }
}
