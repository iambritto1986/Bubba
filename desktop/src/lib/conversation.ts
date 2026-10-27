import { Conversation } from "@elevenlabs/client";
import { useSyncExternalStore } from "react";
import { inferReactionFromText, triggerExpression } from "./expressions";
import { cancelOutfitRevert, inferOutfitFromText, scheduleOutfitRevert, setOutfit } from "./outfits";
import { pushVoiceLevel, setLiveVoice } from "./voice";
import { pushMouthFrame } from "./visemes";

/**
 * Two-way voice chat with Bubba (ElevenLabs Agents over WebRTC).
 * You talk, he listens, answers in his own voice, and can drive the Pomodoro through client tools.
 */

export type ChatStatus = "off" | "connecting" | "listening" | "speaking";
export type ChatState = { status: ChatStatus; agentLine: string | null; userLine: string | null; error: string | null };

type ToolFn = (params: Record<string, unknown>) => string | Promise<string>;
let tools: Record<string, ToolFn> = {};
/** The Buddy screen registers what each tool does (it owns the timer, agenda and PC skills). */
export function setChatTools(t: Record<string, ToolFn>) { tools = t; }

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
  // live mouth shapes for the lip-sync layer (spectrum is already the 100–8000 Hz voice range)
  pushMouthFrame(mode === "speaking" ? v : 0, mode === "speaking" ? conv.getOutputByteFrequencyData() : null);
  raf = requestAnimationFrame(meter);
}

function cleanup(error: string | null = null) {
  cancelAnimationFrame(raf);
  conv = null;
  setLiveVoice(false);
  scheduleOutfitRevert();
  set({ status: "off", error });
}

export async function startChat(
  getToken: () => Promise<string>,
  vars: Record<string, string | number>,
  opts: { voiceId?: string; firstMessage?: string } = {},
) {
  if (state.status !== "off") return;
  set({ status: "connecting", agentLine: null, userLine: null, error: null });
  cancelOutfitRevert();
  setLiveVoice(true);
  try {
    const conversationToken = await getToken();
    // Every registered skill becomes a client tool; errors come back as plain words for the agent.
    const clientTools = Object.fromEntries(
      Object.keys(tools).map((name) => [
        name,
        async (p: Record<string, unknown>) => {
          try {
            return (await tools[name]?.(p ?? {})) ?? "That isn't available right now.";
          } catch (e) {
            return `That didn't work: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      ]),
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
      onMessage: ({ role, message }) => {
        set(role === "agent" ? { agentLine: message } : { userLine: message });
        // Gestures come from the agent's own `express` tool calls (it knows what it means);
        // keyword guessing on transcripts only covers greetings/goodbyes from the person.
        const cue = role !== "agent" ? inferReactionFromText("user", message) : null;
        if (cue === "wave") triggerExpression(cue);
        if (role !== "agent") {
          const look = inferOutfitFromText(message);
          if (look) setOutfit(look);
        }
      },
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
