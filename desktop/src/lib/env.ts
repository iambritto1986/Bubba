export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8787";
export const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
