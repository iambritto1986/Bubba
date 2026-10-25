import { Conversation } from "@elevenlabs/client";
import { useSyncExternalStore } from "react";
import { pushVoiceLevel, setLiveVoice } from "./voice";

/**
 * Two-way voice chat with Bubba (ElevenLabs Agents over WebRTC).
 * You talk, he listens, answers in his own voice, and can drive the Pomodoro through client tools.
 */

export type ChatStatus = "off" | "connecting" | "listening" | "speaking";
export type ChatState = { status: ChatStatus; agentLine: string | null; userLine: string | null; error: string | null };

type ToolFn = (params: Record<string, unknown>) => string | Promise<string>;
const TOOL_NAMES = ["start_focus", "control_timer", "get_status", "tuck_away"] as const;
let tools: Partial<Record<(typeof TOOL_NAMES)[number], ToolFn>> = {};
/** The Buddy screen registers what each tool does (it owns the timer). */
export function setChatTools(t: typeof tools) { tools = t; }

let state: ChatState = { status: "off", agentLine: null, userLine: null, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<ChatState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const useChat = () => useSyncExternalStore(subscribe, () => state);
export const chatActive = () => state.status !== "off";

let conv: Conversation | null = null;
let raf = 0;
let mode: "speaking" | "listening" = "listening";

function meter() {
  if (!conv) return;
  const v = Math.min(1, conv.getOutputVolume() * 2.5);
  pushVoiceLevel(v, mode === "speaking" && v > 0.02);
  raf = requestAnimationFrame(meter);
}

function cleanup(error: string | null = null) {
  cancelAnimationFrame(raf);
  conv = null;
  setLiveVoice(false);
  set({ status: "off", error });
}

export async function startChat(
  getToken: () => Promise<string>,
  vars: Record<string, string | number>,
  opts: { voiceId?: string; firstMessage?: string } = {},
) {
  if (state.status !== "off") return;
  set({ status: "connecting", agentLine: null, userLine: null, error: null });
  setLiveVoice(true);
  try {
    const conversationToken = await getToken();
    const clientTools = Object.fromEntries(
      TOOL_NAMES.map((name) => [name, async (p: Record<string, unknown>) => (await tools[name]?.(p ?? {})) ?? "That isn't available right now."]),
    );
    conv = await Conversation.startSession({
      conversationToken,
      connectionType: "webrtc",
      dynamicVariables: vars,
      overrides: {
        ...(opts.voiceId ? { tts: { voiceId: opts.voiceId } } : {}),
        ...(opts.firstMessage ? { agent: { firstMessage: opts.firstMessage } } : {}),
      },
      clientTools,
      onModeChange: ({ mode: m }) => { mode = m; if (conv) set({ status: m }); },
      onMessage: ({ role, message }) => set(role === "agent" ? { agentLine: message } : { userLine: message }),
      onDisconnect: () => cleanup(),
      onError: (message) => console.error("Bubba voice:", message),
    });
    set({ status: "listening" });
    raf = requestAnimationFrame(meter);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(e);
    cleanup(/permission|notallowed|denied/i.test(msg) ? "I need microphone access to hear you." : "I couldn't open a voice line. Try again in a moment.");
  }
}

export async function stopChat() {
  const c = conv;
  if (!c) { if (state.status === "connecting") cleanup(); return; }
  await c.endSession().catch(() => {});
  cleanup();
}

/** Tell Bubba something happened without him replying to it right away (e.g. the timer ran out). */
export function tellBubba(text: string) { conv?.sendContextualUpdate(text); }
