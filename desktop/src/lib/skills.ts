import { isTauri } from "./env";

/**
 * Bubba's "hands" on the PC, backed by the narrow Rust commands in src-tauri/src/skills.rs.
 * The voice agent calls these through client tools (see Buddy.tsx). Friendly names are mapped
 * here; the Rust side only accepts allowlisted URL schemes, known folders and a fixed app table.
 */

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) throw new Error("That only works in the desktop app.");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** Things people say → how to open them. */
const APPS: Record<string, { url?: string; exe?: string; label: string }> = {
  spotify: { url: "spotify:", label: "Spotify" },
  music: { url: "spotify:", label: "Spotify" },
  youtube: { url: "https://www.youtube.com", label: "YouTube" },
  "youtube music": { url: "https://music.youtube.com", label: "YouTube Music" },
  gmail: { url: "https://mail.google.com", label: "Gmail" },
  email: { url: "https://mail.google.com", label: "your email" },
  mail: { url: "https://mail.google.com", label: "your email" },
  outlook: { url: "https://outlook.live.com/mail", label: "Outlook" },
  calendar: { url: "https://calendar.google.com", label: "your calendar" },
  "google calendar": { url: "https://calendar.google.com", label: "Google Calendar" },
  "google docs": { url: "https://docs.google.com", label: "Google Docs" },
  "google drive": { url: "https://drive.google.com", label: "Google Drive" },
  drive: { url: "https://drive.google.com", label: "Google Drive" },
  sheets: { url: "https://sheets.google.com", label: "Google Sheets" },
  chatgpt: { url: "https://chatgpt.com", label: "ChatGPT" },
  claude: { url: "https://claude.ai", label: "Claude" },
  linkedin: { url: "https://www.linkedin.com", label: "LinkedIn" },
  github: { url: "https://github.com", label: "GitHub" },
  netflix: { url: "https://www.netflix.com", label: "Netflix" },
  maps: { url: "https://maps.google.com", label: "Google Maps" },
  news: { url: "https://news.google.com", label: "Google News" },
  weather: { url: "https://www.google.com/search?q=weather", label: "the weather" },
  word: { url: "ms-word:", label: "Word" },
  excel: { url: "ms-excel:", label: "Excel" },
  powerpoint: { url: "ms-powerpoint:", label: "PowerPoint" },
  teams: { url: "msteams:", label: "Teams" },
  slack: { url: "slack:", label: "Slack" },
  discord: { url: "discord:", label: "Discord" },
  whatsapp: { url: "whatsapp:", label: "WhatsApp" },
  notion: { url: "notion:", label: "Notion" },
  zoom: { url: "zoommtg:", label: "Zoom" },
  "vs code": { url: "vscode:", label: "VS Code" },
  vscode: { url: "vscode:", label: "VS Code" },
  settings: { url: "ms-settings:", label: "Settings" },
  "display settings": { url: "ms-settings:display", label: "display settings" },
  "sound settings": { url: "ms-settings:sound", label: "sound settings" },
  "bluetooth": { url: "ms-settings:bluetooth", label: "Bluetooth settings" },
  "wifi": { url: "ms-settings:network-wifi", label: "Wi-Fi settings" },
  clock: { url: "ms-clock:", label: "Clock" },
  alarms: { url: "ms-clock:", label: "Alarms & Clock" },
  photos: { url: "ms-photos:", label: "Photos" },
  store: { url: "ms-windows-store:", label: "the Microsoft Store" },
  "to do": { url: "ms-todo:", label: "Microsoft To Do" },
  onenote: { url: "onenote:", label: "OneNote" },
  "snipping tool": { url: "ms-screenclip:", label: "the snipping tool" },
  screenshot: { url: "ms-screenclip:", label: "the snipping tool" },
  edge: { url: "microsoft-edge:https://www.bing.com", label: "Edge" },
  browser: { url: "https://www.google.com", label: "your browser" },
  chrome: { url: "https://www.google.com", label: "your browser" },
  notepad: { exe: "notepad", label: "Notepad" },
  paint: { exe: "paint", label: "Paint" },
  calculator: { exe: "calculator", label: "Calculator" },
  calc: { exe: "calculator", label: "Calculator" },
  "file explorer": { exe: "file explorer", label: "File Explorer" },
  explorer: { exe: "file explorer", label: "File Explorer" },
  "task manager": { exe: "task manager", label: "Task Manager" },
};

const FOLDERS = ["desktop", "documents", "downloads", "pictures", "music", "videos", "home"];

export const KNOWN_APPS = Object.keys(APPS);

/** Open an app, website or folder by its everyday name ("spotify", "my downloads", "bbc.co.uk"). */
export async function openThing(what: string): Promise<string> {
  const q = what.toLowerCase().replace(/^(my|the)\s+/, "").replace(/\s+(app|folder|website|site)$/, "").trim();
  if (!q) return "Open what, exactly?";
  if (FOLDERS.includes(q)) return invoke<string>("open_folder", { folder: q });
  const app = APPS[q];
  if (app?.exe) return invoke<string>("launch_app", { app: app.exe }).then(() => `Opened ${app.label}.`);
  if (app?.url) return invoke<string>("open_url", { url: app.url }).then(() => `Opened ${app.label}.`);
  // something that looks like a site
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(q) || /^https?:\/\//.test(q)) {
    return invoke<string>("open_url", { url: q });
  }
  return `I don't have a shortcut for "${what}". I can open: ${KNOWN_APPS.slice(0, 25).join(", ")}, your folders, any website, or search the web for it.`;
}

/** Open a web search (Google) for the query, in the default browser. */
export function webSearch(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return Promise.resolve("Search for what?");
  return invoke<string>("open_url", { url: `https://www.google.com/search?q=${encodeURIComponent(q)}` })
    .then(() => `Searching the web for "${q}".`);
}

/** Open a YouTube search / Spotify search for the query. */
export function playMusic(query: string): Promise<string> {
  const q = query.trim();
  const url = q ? `spotify:search:${encodeURIComponent(q)}` : "spotify:";
  return invoke<string>("open_url", { url }).then(() => (q ? `Looking up "${q}" on Spotify.` : "Opened Spotify."));
}

export function readClipboard(): Promise<string> {
  return invoke<string>("read_clipboard");
}

export function writeClipboard(text: string): Promise<string> {
  return invoke<string>("write_clipboard", { text });
}

export type ActiveWindow = { title: string; app: string };
export function activeWindow(): Promise<ActiveWindow> {
  if (!isTauri) return Promise.resolve({ title: document.title, app: "browser" });
  return invoke<ActiveWindow>("active_window");
}
