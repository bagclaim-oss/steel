/**
 * VoiceControl — floating action button (FAB) for Gemini voice control.
 *
 * Renders a microphone button in the bottom-right corner. When clicked,
 * it starts a Gemini Live API voice session for hands-free control of
 * The Companion. Shows connection state, live transcript, tool call info,
 * and context input (text + image) for sending additional context to Gemini.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "../store.js";
import { startVoiceSession, stopVoiceSession, sendVoiceContext, sendVoiceImage } from "../utils/voice-session.js";

/** Human-readable labels for tool calls. */
const TOOL_LABELS: Record<string, string> = {
  create_session: "Creating session…",
  send_message: "Typing message…",
  approve_permission: "Clicking Allow…",
  deny_permission: "Clicking Deny…",
  approve_all_permissions: "Approving all…",
  navigate_page: "Navigating…",
  switch_session: "Switching session…",
  list_sessions: "Listing sessions…",
  interrupt_session: "Clicking Stop…",
  get_session_status: "Getting status…",
};

export function VoiceControl() {
  const active = useStore((s) => s.voiceActive);
  const connecting = useStore((s) => s.voiceConnecting);
  const listening = useStore((s) => s.voiceListening);
  const speaking = useStore((s) => s.voiceSpeaking);
  const transcript = useStore((s) => s.voiceTranscript);
  const lastToolCall = useStore((s) => s.voiceLastToolCall);
  const error = useStore((s) => s.voiceError);
  const pendingAction = useStore((s) => s.voicePendingAction);

  const [contextText, setContextText] = useState("");
  const [contextImages, setContextImages] = useState<Array<{ name: string; base64: string; mimeType: string }>>([]);
  const contextInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isExpanded = active || connecting || !!error;

  // Escape key stops voice session
  useEffect(() => {
    if (!active && !connecting) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Don't stop if user is typing in context input
        if (document.activeElement === contextInputRef.current) return;
        e.preventDefault();
        stopVoiceSession();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, connecting]);

  // Auto-clear error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      useStore.getState().setVoiceError(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleClick = useCallback(() => {
    if (active || connecting) {
      stopVoiceSession();
    } else {
      startVoiceSession();
    }
  }, [active, connecting]);

  // Send text context to Gemini
  const handleSendContext = useCallback(() => {
    const text = contextText.trim();
    if (!text) return;
    sendVoiceContext(text);
    setContextText("");
    contextInputRef.current?.focus();
  }, [contextText]);

  // Send image context to Gemini
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Extract base64 data after "data:image/png;base64,"
        const base64 = dataUrl.split(",")[1];
        const mimeType = file.type;
        sendVoiceImage(base64, mimeType);
        setContextImages((prev) => [...prev, { name: file.name, base64, mimeType }]);
        // Auto-clear preview after 3s
        setTimeout(() => {
          setContextImages((prev) => prev.filter((img) => img.base64 !== base64));
        }, 3000);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  }, []);

  // Handle paste for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        sendVoiceImage(base64, file.type);
        setContextImages((prev) => [...prev, { name: `pasted-${Date.now()}`, base64, mimeType: file.type }]);
        setTimeout(() => {
          setContextImages((prev) => prev.filter((img) => img.base64 !== base64));
        }, 3000);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const toolLabel = lastToolCall ? (TOOL_LABELS[lastToolCall.name] || lastToolCall.name) : null;
  const actionLabel = pendingAction ? (TOOL_LABELS[pendingAction.type] || null) : null;

  // Truncate transcript for display (last 200 chars)
  const displayTranscript = transcript.length > 200
    ? "…" + transcript.slice(-200)
    : transcript;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2"
      style={{ pointerEvents: "none" }}
    >
      {/* Expanded panel (transcript + tool call info + context input) */}
      {isExpanded && (
        <div
          className={`
            w-[300px] sm:w-[360px] rounded-2xl border shadow-lg backdrop-blur-sm
            transition-all duration-300 animate-[fadeSlideIn_0.2s_ease-out]
            ${error
              ? "bg-cc-error/5 border-cc-error/20"
              : "bg-cc-card/95 border-cc-border"
            }
          `}
          style={{ pointerEvents: "auto" }}
          role="status"
          aria-live="polite"
        >
          <div className="px-4 py-3 space-y-2">
            {/* Status line */}
            <div className="flex items-center gap-2 text-xs font-medium">
              {error ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-cc-error shrink-0" />
                  <span className="text-cc-error truncate">{error}</span>
                </>
              ) : connecting ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-cc-warning animate-pulse shrink-0" />
                  <span className="text-cc-warning">Connecting to Gemini…</span>
                </>
              ) : speaking ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-cc-primary shrink-0 animate-pulse" />
                  <span className="text-cc-primary">Speaking…</span>
                </>
              ) : listening ? (
                <>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cc-primary/60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cc-primary" />
                  </span>
                  <span className="text-cc-primary">Listening…</span>
                </>
              ) : null}
            </div>

            {/* Tool call / action info */}
            {(toolLabel || actionLabel) && !error && (
              <div className="flex items-center gap-1.5 text-[11px] text-cc-muted">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 opacity-60 shrink-0">
                  <path d="M14.7 3.3a1 1 0 010 1.4l-5 5a1 1 0 01-1.4 0l-2-2a1 1 0 011.4-1.4L9 7.6l4.3-4.3a1 1 0 011.4 0zM5.5 7.5L3 10v2h2l2.5-2.5" />
                </svg>
                <span className="truncate">{actionLabel || toolLabel}</span>
              </div>
            )}

            {/* Transcript */}
            {displayTranscript && !error && (
              <p className="text-xs text-cc-fg/80 leading-relaxed max-h-[60px] overflow-y-auto break-words">
                {displayTranscript}
              </p>
            )}

            {/* Context image previews */}
            {contextImages.length > 0 && !error && (
              <div className="flex gap-1.5 flex-wrap">
                {contextImages.map((img, i) => (
                  <div key={i} className="relative">
                    <img
                      src={`data:${img.mimeType};base64,${img.base64}`}
                      alt={img.name}
                      className="w-10 h-10 rounded-md object-cover border border-cc-border opacity-70"
                    />
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 border border-white flex items-center justify-center">
                      <svg viewBox="0 0 16 16" fill="white" className="w-2 h-2">
                        <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
                      </svg>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Context input — text + image upload */}
            {active && !error && (
              <div className="flex items-center gap-1.5 pt-1 border-t border-cc-border/50">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                  aria-label="Upload image for Gemini context"
                />

                {/* Image upload button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer shrink-0"
                  title="Send image to Gemini"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                    <rect x="2" y="2" width="12" height="12" rx="2" />
                    <circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
                    <path d="M2 11l3-3 2 2 3-4 4 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Text context input */}
                <input
                  ref={contextInputRef}
                  type="text"
                  value={contextText}
                  onChange={(e) => setContextText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendContext();
                    }
                  }}
                  onPaste={handlePaste}
                  placeholder="Add context…"
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-transparent border border-cc-border/50 rounded-md text-cc-fg placeholder:text-cc-muted/50 focus:outline-none focus:border-cc-primary/40"
                />

                {/* Send context button */}
                <button
                  onClick={handleSendContext}
                  disabled={!contextText.trim()}
                  className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors shrink-0 ${
                    contextText.trim()
                      ? "text-cc-primary hover:bg-cc-primary/10 cursor-pointer"
                      : "text-cc-muted/30 cursor-not-allowed"
                  }`}
                  title="Send text context to Gemini"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <path d="M3 2l11 6-11 6V9.5l7-1.5-7-1.5V2z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={handleClick}
        className={`
          relative flex items-center justify-center
          w-12 h-12 sm:w-14 sm:h-14 rounded-full
          shadow-lg transition-all duration-200
          cursor-pointer select-none
          ${error
            ? "bg-cc-error/10 border-2 border-cc-error/30 text-cc-error hover:bg-cc-error/20"
            : active
              ? "bg-cc-primary text-white shadow-[0_4px_20px_rgba(217,119,87,0.35)] hover:bg-cc-primary-hover"
              : connecting
                ? "bg-cc-card border-2 border-cc-warning/40 text-cc-warning"
                : "bg-cc-card border border-cc-border text-cc-muted hover:text-cc-fg hover:border-cc-primary/30 hover:shadow-[0_4px_16px_rgba(217,119,87,0.15)]"
          }
        `}
        style={{ pointerEvents: "auto" }}
        aria-label={active ? "Stop voice control" : "Start voice control"}
        title={active ? "Stop voice control (Esc)" : "Start Gemini voice control"}
      >
        {/* Connecting spinner */}
        {connecting && (
          <span className="absolute inset-0 rounded-full border-2 border-cc-warning/30 border-t-cc-warning animate-spin" />
        )}

        {/* Active pulse ring */}
        {active && !connecting && (
          <span className="absolute inset-0 rounded-full animate-ping bg-cc-primary/20" style={{ animationDuration: "2s" }} />
        )}

        {/* Icon: microphone (idle/listening) or stop (active) */}
        {active ? (
          // Stop icon
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5 relative z-10">
            <rect x="4" y="4" width="8" height="8" rx="1" />
          </svg>
        ) : (
          // Microphone icon
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5 relative z-10">
            <path d="M8 1a2 2 0 00-2 2v4a2 2 0 004 0V3a2 2 0 00-2-2z" />
            <path d="M4.5 6.5a.5.5 0 00-1 0V7a4.5 4.5 0 004 4.473V13H6a.5.5 0 000 1h4a.5.5 0 000-1H8.5v-1.527A4.5 4.5 0 0012.5 7v-.5a.5.5 0 00-1 0V7a3.5 3.5 0 11-7 0v-.5z" />
          </svg>
        )}
      </button>
    </div>
  );
}
