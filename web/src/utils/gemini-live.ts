/**
 * Browser-side client for the Gemini Live API using the @google/genai SDK.
 *
 * Uses `ai.live.connect()` with `gemini-3.1-flash-live-preview` for real-time
 * bidirectional audio + function calling. The SDK handles WebSocket management,
 * message serialization, and reconnection internally.
 *
 * Reference: https://ai.google.dev/gemini-api/docs/live
 */

import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
  type FunctionDeclaration,
} from "@google/genai";

export interface GeminiToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiLiveCallbacks {
  /** Called when the Gemini session is set up and ready for audio. */
  onReady: () => void;
  /** Called with base64-encoded audio data from Gemini. */
  onAudio: (base64Data: string) => void;
  /** Called with text content from Gemini (transcript or response). */
  onText: (text: string) => void;
  /** Called when Gemini requests a tool/function call. */
  onToolCall: (call: GeminiToolCall) => void;
  /** Called on connection or protocol error. */
  onError: (error: string) => void;
  /** Called when the WebSocket connection is closed. */
  onDisconnect: () => void;
  /** Called when Gemini interrupts its own output (e.g. user barge-in). */
  onInterrupted: () => void;
}

export interface GeminiLiveConfig {
  /** The Gemini model to use. Defaults to gemini-3.1-flash-live-preview. */
  model?: string;
  /** System instruction for the Gemini session. */
  systemInstruction?: string;
  /** Function declarations for tool calling. */
  tools?: FunctionDeclaration[];
  /** Voice name for speech output. */
  voiceName?: string;
}

const DEFAULT_MODEL = "models/gemini-3.1-flash-live-preview";
const DEFAULT_VOICE = "Kore";

/**
 * Client for the Gemini Live API using the official @google/genai SDK.
 *
 * Usage:
 * ```ts
 * const client = new GeminiLiveClient("API_KEY", callbacks, config);
 * await client.connect();
 * // Send audio chunks from microphone:
 * client.sendAudio(base64PcmChunk);
 * // When Gemini calls a tool, execute it and respond:
 * client.sendToolResponse(toolCallId, toolCallName, result);
 * // Disconnect:
 * client.disconnect();
 * ```
 */
export class GeminiLiveClient {
  private session: Session | null = null;
  private _connected = false;
  private apiKey: string;
  private callbacks: GeminiLiveCallbacks;
  private config: GeminiLiveConfig;

  constructor(apiKey: string, callbacks: GeminiLiveCallbacks, config: GeminiLiveConfig = {}) {
    this.apiKey = apiKey;
    this.callbacks = callbacks;
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  /** Connect to Gemini Live API using the SDK. */
  async connect(): Promise<void> {
    if (this.session) return;

    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const model = this.config.model || DEFAULT_MODEL;
    const voiceName = this.config.voiceName || DEFAULT_VOICE;

    try {
      this.session = await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO, Modality.TEXT],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          systemInstruction: this.config.systemInstruction || undefined,
          tools: this.config.tools && this.config.tools.length > 0
            ? [{ functionDeclarations: this.config.tools }]
            : undefined,
        },
        callbacks: {
          onopen: () => {
            this._connected = true;
            this.callbacks.onReady();
          },
          onmessage: (message: LiveServerMessage) => {
            this.handleMessage(message);
          },
          onerror: (e: ErrorEvent) => {
            this.callbacks.onError(e.message || "Gemini connection error");
          },
          onclose: () => {
            this._connected = false;
            this.session = null;
            this.callbacks.onDisconnect();
          },
        },
      });
    } catch (e) {
      this._connected = false;
      this.session = null;
      this.callbacks.onError(e instanceof Error ? e.message : "Failed to connect to Gemini");
    }
  }

  /** Send a base64-encoded PCM 16kHz audio chunk. */
  sendAudio(base64Pcm: string): void {
    if (!this.session) return;
    const bytes = Uint8Array.from(atob(base64Pcm), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "audio/pcm;rate=16000" });
    // The SDK's Blob_2 type is structurally compatible with the browser Blob
    this.session.sendRealtimeInput({ audio: blob as unknown as Parameters<Session["sendRealtimeInput"]>[0]["audio"] });
  }

  /** Send a tool/function call response back to Gemini. */
  sendToolResponse(id: string, name: string, result: unknown): void {
    if (!this.session) return;
    this.session.sendToolResponse({
      functionResponses: [{
        id,
        name,
        response: (result ?? { success: true }) as Record<string, unknown>,
      }],
    });
  }

  /** Disconnect and clean up. */
  disconnect(): void {
    this._connected = false;
    if (this.session) {
      try { this.session.close(); } catch { /* ignore */ }
      this.session = null;
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private handleMessage(message: LiveServerMessage): void {
    // Tool calls from the model
    if (message.toolCall?.functionCalls) {
      for (const fc of message.toolCall.functionCalls) {
        if (fc.id && fc.name) {
          this.callbacks.onToolCall({
            id: fc.id,
            name: fc.name,
            args: (fc.args as Record<string, unknown>) || {},
          });
        }
      }
      return;
    }

    // Tool call cancellation (barge-in interrupted a pending call)
    if (message.toolCallCancellation) {
      this.callbacks.onInterrupted();
      return;
    }

    // Server content (model response: audio + text)
    if (message.serverContent) {
      // Barge-in: model output was interrupted by user speech
      if (message.serverContent.interrupted) {
        this.callbacks.onInterrupted();
        return;
      }

      // Extract audio and text from model turn parts
      if (message.serverContent.modelTurn?.parts) {
        for (const part of message.serverContent.modelTurn.parts) {
          if (part.inlineData?.data) {
            this.callbacks.onAudio(part.inlineData.data);
          }
          if (part.text) {
            this.callbacks.onText(part.text);
          }
        }
      }
    }
  }
}
