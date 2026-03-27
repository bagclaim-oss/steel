/**
 * Zustand slice for voice control state.
 *
 * Tracks whether the voice session is active, connecting, listening,
 * or speaking, plus the current transcript, tool call info, and the
 * pending visual action queue (for typing animations, button clicks, etc.).
 */

import type { StateCreator } from "zustand";
import type { AppState } from "./index.js";

// ─── Voice Action Types ──────────────────────────────────────────────────────

/** Actions dispatched by Gemini tool calls for visual UI execution. */
export type VoiceAction =
  | { type: "type_and_send"; target: "composer" | "home"; text: string; sessionId?: string }
  | { type: "click_allow"; sessionId: string; requestId: string }
  | { type: "click_deny"; sessionId: string; requestId: string }
  | { type: "click_allow_all"; sessionId: string }
  | { type: "navigate"; page: string }
  | { type: "switch_session"; sessionId: string }
  | { type: "click_interrupt"; sessionId: string };

// ─── Slice Interface ─────────────────────────────────────────────────────────

export interface VoiceSlice {
  /** Whether a Gemini voice session is currently active. */
  voiceActive: boolean;
  /** Whether we're currently connecting to Gemini. */
  voiceConnecting: boolean;
  /** Whether the microphone is actively capturing audio. */
  voiceListening: boolean;
  /** Whether Gemini audio is currently playing back. */
  voiceSpeaking: boolean;
  /** Current transcript text (from user speech or Gemini response). */
  voiceTranscript: string;
  /** The most recent tool call made by Gemini (for UI display). */
  voiceLastToolCall: { name: string; args: Record<string, unknown> } | null;
  /** Current error message, if any. */
  voiceError: string | null;

  /** Pending visual action from a Gemini tool call, awaiting component execution. */
  voicePendingAction: VoiceAction | null;
  /** Resolver function — called by the component when the visual action is complete. */
  _voiceActionResolve: ((result: unknown) => void) | null;

  setVoiceActive: (active: boolean) => void;
  setVoiceConnecting: (connecting: boolean) => void;
  setVoiceListening: (listening: boolean) => void;
  setVoiceSpeaking: (speaking: boolean) => void;
  setVoiceTranscript: (text: string) => void;
  appendVoiceTranscript: (text: string) => void;
  setVoiceLastToolCall: (call: { name: string; args: Record<string, unknown> } | null) => void;
  setVoiceError: (error: string | null) => void;

  /** Dispatch a visual action and store the resolver for when it completes. */
  dispatchVoiceAction: (action: VoiceAction, resolve: (result: unknown) => void) => void;
  /** Called by the UI component after executing the visual action. */
  completeVoiceAction: (result: unknown) => void;

  resetVoice: () => void;
}

// ─── Slice Implementation ────────────────────────────────────────────────────

export const createVoiceSlice: StateCreator<AppState, [], [], VoiceSlice> = (set, get) => ({
  voiceActive: false,
  voiceConnecting: false,
  voiceListening: false,
  voiceSpeaking: false,
  voiceTranscript: "",
  voiceLastToolCall: null,
  voiceError: null,
  voicePendingAction: null,
  _voiceActionResolve: null,

  setVoiceActive: (active) => set({ voiceActive: active }),
  setVoiceConnecting: (connecting) => set({ voiceConnecting: connecting }),
  setVoiceListening: (listening) => set({ voiceListening: listening }),
  setVoiceSpeaking: (speaking) => set({ voiceSpeaking: speaking }),
  setVoiceTranscript: (text) => set({ voiceTranscript: text }),
  appendVoiceTranscript: (text) =>
    set((s) => ({ voiceTranscript: s.voiceTranscript + text })),
  setVoiceLastToolCall: (call) => set({ voiceLastToolCall: call }),
  setVoiceError: (error) => set({ voiceError: error }),

  dispatchVoiceAction: (action, resolve) =>
    set({ voicePendingAction: action, _voiceActionResolve: resolve }),

  completeVoiceAction: (result) => {
    const resolver = get()._voiceActionResolve;
    set({ voicePendingAction: null, _voiceActionResolve: null });
    resolver?.(result);
  },

  resetVoice: () =>
    set({
      voiceActive: false,
      voiceConnecting: false,
      voiceListening: false,
      voiceSpeaking: false,
      voiceTranscript: "",
      voiceLastToolCall: null,
      voiceError: null,
      voicePendingAction: null,
      _voiceActionResolve: null,
    }),
});
