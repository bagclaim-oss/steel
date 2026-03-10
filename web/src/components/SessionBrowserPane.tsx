import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useStore } from "../store.js";

interface SessionBrowserPaneProps {
  sessionId: string;
}

export function SessionBrowserPane({ sessionId }: SessionBrowserPaneProps) {
  const [loading, setLoading] = useState(true);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [navUrl, setNavUrl] = useState("http://localhost:3000");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sdkSession = useStore((s) =>
    s.sdkSessions.find((sdk) => sdk.sessionId === sessionId),
  );

  const isContainerSession = !!sdkSession?.containerId;

  // Start the display stack and get the proxied noVNC URL
  useEffect(() => {
    if (!isContainerSession) {
      setError("Browser preview requires a containerized session.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api.startBrowser(sessionId).then((result) => {
      if (cancelled) return;
      if (result.available && result.url) {
        setBrowserUrl(result.url);
      } else {
        setError(result.message || "Browser preview unavailable.");
      }
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : "Failed to start browser preview");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [sessionId, isContainerSession]);

  const handleNavigate = useCallback(() => {
    if (!navUrl.trim()) return;
    api.navigateBrowser(sessionId, navUrl.trim()).catch(() => {});
  }, [sessionId, navUrl]);

  const handleReload = useCallback(() => {
    if (iframeRef.current && browserUrl) {
      iframeRef.current.src = browserUrl;
    }
  }, [browserUrl]);

  if (!isContainerSession) {
    return (
      <div className="h-full flex items-center justify-center p-4 text-sm text-cc-muted">
        Browser preview is only available for containerized sessions.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-4">
        <div className="w-5 h-5 border-2 border-cc-primary border-t-transparent rounded-full animate-spin" />
        <div className="text-sm text-cc-muted">Starting browser preview...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="px-4 py-3 rounded-lg bg-cc-error/10 border border-cc-error/30 text-sm text-cc-error max-w-md text-center">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-cc-bg">
      {/* Toolbar */}
      <div className="shrink-0 px-3 py-2 border-b border-cc-border flex items-center gap-2">
        <button
          type="button"
          onClick={handleReload}
          className="flex items-center justify-center w-7 h-7 rounded text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer"
          aria-label="Reload browser"
          title="Reload"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M13.65 2.35a1 1 0 0 0-1.3 0L11 3.7A5.99 5.99 0 0 0 2 8a1 1 0 1 0 2 0 4 4 0 0 1 6.29-3.29L8.65 6.35a1 1 0 0 0 .7 1.7H13a1 1 0 0 0 1-1V3.4a1 1 0 0 0-.35-.7z M14 8a1 1 0 1 0-2 0 4 4 0 0 1-6.29 3.29l1.64-1.64a1 1 0 0 0-.7-1.7H3.05a1 1 0 0 0-1 1v3.65a1 1 0 0 0 1.7.7L5 11.7A5.99 5.99 0 0 0 14 8z" />
          </svg>
        </button>
        <input
          type="text"
          value={navUrl}
          onChange={(e) => setNavUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleNavigate(); }}
          placeholder="http://localhost:3000"
          className="flex-1 px-2 py-1 text-xs rounded bg-cc-bg border border-cc-border text-cc-fg placeholder:text-cc-muted focus:outline-none focus:border-cc-primary"
          aria-label="Navigate URL"
        />
        <button
          type="button"
          onClick={handleNavigate}
          className="px-3 py-1 rounded text-xs font-medium bg-cc-primary text-white hover:bg-cc-primary-hover transition-colors cursor-pointer"
        >
          Go
        </button>
      </div>

      {/* noVNC iframe */}
      <div className="flex-1 min-h-0">
        {browserUrl && (
          <iframe
            ref={iframeRef}
            src={browserUrl}
            className="w-full h-full border-0"
            title="Browser preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        )}
      </div>
    </div>
  );
}
