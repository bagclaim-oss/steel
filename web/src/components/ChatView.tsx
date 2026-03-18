import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useStore } from "../store.js";
import { api } from "../api.js";
import { captureException } from "../analytics.js";
import { MessageFeed } from "./MessageFeed.js";
import { Composer } from "./Composer.js";
import { PermissionBanner } from "./PermissionBanner.js";
import { AiValidationBadge } from "./AiValidationBadge.js";

export function ChatView({ sessionId }: { sessionId: string }) {
  const sessionPerms = useStore((s) => s.pendingPermissions.get(sessionId));
  const aiResolved = useStore((s) => s.aiResolvedPermissions.get(sessionId));
  const clearAiResolvedPermissions = useStore((s) => s.clearAiResolvedPermissions);
  const connStatus = useStore(
    (s) => s.connectionStatus.get(sessionId) ?? "disconnected"
  );
  const cliConnected = useStore((s) => s.cliConnected.get(sessionId) ?? false);
  const cliReconnecting = useStore(
    (s) => s.cliReconnecting.get(sessionId) ?? false
  );
  const setCliReconnecting = useStore((s) => s.setCliReconnecting);

  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Clear stale error when switching sessions or when CLI reconnects
  useEffect(() => {
    setReconnectError(null);
    clearTimeout(errorTimerRef.current);
  }, [sessionId, cliConnected]);

  // Clean up error auto-clear timer on unmount
  useEffect(() => () => clearTimeout(errorTimerRef.current), []);

  const handleReconnect = useCallback(async () => {
    setReconnectError(null);
    clearTimeout(errorTimerRef.current);
    setCliReconnecting(sessionId, true);
    try {
      await api.relaunchSession(sessionId);
    } catch (err) {
      captureException(err);
      setCliReconnecting(sessionId, false);
      const msg =
        err instanceof Error ? err.message : "Reconnection failed";
      setReconnectError(msg);
      errorTimerRef.current = setTimeout(() => setReconnectError(null), 4000);
    }
  }, [sessionId, setCliReconnecting]);

  const perms = useMemo(
    () => (sessionPerms ? Array.from(sessionPerms.values()) : []),
    [sessionPerms]
  );

  const showCliBanner = connStatus === "connected" && !cliConnected;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-cc-card)_68%,transparent_32%)_0%,transparent_22%)]">
      {/* CLI disconnected / reconnecting / error banner */}
      {showCliBanner && (
        <div className="mx-4 mt-4 rounded-2xl border border-cc-warning/20 bg-gradient-to-r from-cc-warning/10 to-transparent px-4 py-3 flex items-center justify-center gap-3 animate-[fadeSlideIn_0.3s_ease-out]">
          {reconnectError ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-cc-error shrink-0" />
              <span className="text-xs text-cc-error font-medium">
                {reconnectError}
              </span>
              <button
                onClick={handleReconnect}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-cc-error/12 hover:bg-cc-error/20 text-cc-error transition-all cursor-pointer"
              >
                Retry
              </button>
            </>
          ) : cliReconnecting ? (
            <>
              <span className="w-3 h-3 rounded-full border-2 border-cc-warning/30 border-t-cc-warning animate-spin" />
              <span className="text-xs text-cc-warning font-medium">
                Reconnecting&hellip;
              </span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-cc-warning animate-[pulse-dot_1.5s_ease-in-out_infinite] shrink-0" />
              <span className="text-xs text-cc-warning font-medium">
                CLI disconnected
              </span>
              <button
                onClick={handleReconnect}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-cc-warning/15 hover:bg-cc-warning/25 text-cc-warning transition-all cursor-pointer"
              >
                Reconnect
              </button>
            </>
          )}
        </div>
      )}

      {/* WebSocket disconnected banner */}
      {connStatus === "disconnected" && (
        <div className="mx-4 mt-4 rounded-2xl border border-cc-warning/20 bg-gradient-to-r from-cc-warning/10 to-transparent px-4 py-3 flex items-center justify-center gap-2 animate-[fadeSlideIn_0.3s_ease-out]">
          <span className="w-3 h-3 rounded-full border-2 border-cc-warning/30 border-t-cc-warning animate-spin" />
          <span className="text-xs text-cc-warning font-medium">
            Reconnecting to session...
          </span>
        </div>
      )}

      {/* Message feed */}
      <MessageFeed sessionId={sessionId} />

      {/* AI auto-resolved notification (most recent only) */}
      {aiResolved && aiResolved.length > 0 && (
        <div className="shrink-0 border-t border-cc-border bg-cc-card/78 backdrop-blur">
          <AiValidationBadge
            entry={aiResolved[aiResolved.length - 1]}
            onDismiss={() => clearAiResolvedPermissions(sessionId)}
          />
        </div>
      )}

      {/* Permission banners */}
      {perms.length > 0 && (
        <div className="shrink-0 max-h-[60dvh] overflow-y-auto border-t border-cc-border bg-cc-card/82 backdrop-blur">
          {perms.map((p) => (
            <PermissionBanner key={p.request_id} permission={p} sessionId={sessionId} />
          ))}
        </div>
      )}

      {/* Composer */}
      <Composer sessionId={sessionId} />
    </div>
  );
}
