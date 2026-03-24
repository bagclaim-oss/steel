import { useState, useCallback, useMemo } from "react";
import { useStore } from "../store.js";
import { api } from "../api.js";
import type { PortStatusInfo } from "../store/environment-slice.js";

const EMPTY_PORTS: PortStatusInfo[] = [];

/**
 * Unified Environment panel — combines port/service status bar,
 * browser preview (iframe), and terminal into one coherent view.
 * Ports from .companion/launch.json are pre-configured with health checks.
 */
export function EnvironmentPanel({ sessionId }: { sessionId: string }) {
  const portStatuses = useStore((s) => s.portStatuses.get(sessionId) ?? EMPTY_PORTS);
  const activePort = useStore((s) => s.activePort.get(sessionId) ?? null);
  const setActivePort = useStore((s) => s.setActivePort);
  const [customUrl, setCustomUrl] = useState("");
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  // Build proxy URL for a given port
  const proxyUrlForPort = useCallback(
    (port: number, path = "/") =>
      `/api/sessions/${encodeURIComponent(sessionId)}/browser/host-proxy/${port}${path}`,
    [sessionId],
  );

  // When a port is clicked, open it in the iframe
  const openPort = useCallback(
    (port: number) => {
      setActivePort(sessionId, port);
      setIframeUrl(proxyUrlForPort(port));
    },
    [sessionId, setActivePort, proxyUrlForPort],
  );

  // Navigate to custom URL
  const navigateToUrl = useCallback(() => {
    if (!customUrl.trim()) return;
    try {
      const parsed = new URL(customUrl.startsWith("http") ? customUrl : `http://${customUrl}`);
      const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
      const subPath = parsed.pathname + parsed.search;
      setIframeUrl(proxyUrlForPort(Number(port), subPath));
      setActivePort(sessionId, Number(port));
    } catch {
      // Invalid URL — just try as-is
      setIframeUrl(customUrl);
    }
  }, [customUrl, sessionId, proxyUrlForPort, setActivePort]);

  // Manual health check refresh
  const refreshPort = useCallback(
    async (port: number) => {
      try {
        await api.checkPort(sessionId, port);
      } catch {
        // ignore
      }
    },
    [sessionId],
  );

  const hasLaunchPorts = portStatuses.length > 0;

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Port status bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-primary bg-bg-secondary overflow-x-auto shrink-0">
        {hasLaunchPorts ? (
          portStatuses.map((ps) => (
            <PortPill
              key={ps.port}
              portStatus={ps}
              isActive={activePort === ps.port}
              onClick={() => openPort(ps.port)}
              onRefresh={() => refreshPort(ps.port)}
            />
          ))
        ) : (
          <span className="text-xs text-text-tertiary">
            No ports configured. Add a <code>.companion/launch.json</code> to your project.
          </span>
        )}

        {/* URL input */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <input
            type="text"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && navigateToUrl()}
            placeholder="localhost:3000"
            className="text-xs px-2 py-1 bg-bg-primary border border-border-primary rounded w-40 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-primary"
          />
          <button
            onClick={navigateToUrl}
            className="text-xs px-2 py-1 bg-bg-tertiary hover:bg-bg-hover rounded text-text-secondary"
          >
            Go
          </button>
        </div>
      </div>

      {/* Browser preview */}
      <div className="flex-1 relative">
        {iframeUrl ? (
          <iframe
            src={iframeUrl}
            className="absolute inset-0 w-full h-full border-none"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            title="Environment preview"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
            {hasLaunchPorts
              ? "Click a port above to preview"
              : "Enter a URL or configure ports in .companion/launch.json"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Port Pill Component ─────────────────────────────────────────────────────

function PortPill({
  portStatus,
  isActive,
  onClick,
  onRefresh,
}: {
  portStatus: PortStatusInfo;
  isActive: boolean;
  onClick: () => void;
  onRefresh: () => void;
}) {
  const statusColor = useMemo(() => {
    switch (portStatus.status) {
      case "healthy": return "bg-green-500";
      case "unhealthy": return "bg-red-500";
      default: return "bg-yellow-500";
    }
  }, [portStatus.status]);

  const canPreview = portStatus.protocol === "http";

  return (
    <button
      onClick={canPreview ? onClick : onRefresh}
      className={`
        flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors
        ${isActive
          ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/40"
          : "bg-bg-tertiary text-text-secondary hover:bg-bg-hover border border-transparent"
        }
      `}
      title={`${portStatus.label} (:${portStatus.port}) — ${portStatus.status}${portStatus.service ? ` (${portStatus.service})` : ""}${!canPreview ? " (TCP only)" : ""}`}
    >
      <span className={`w-2 h-2 rounded-full ${statusColor}`} />
      <span className="font-medium">{portStatus.label}</span>
      <span className="text-text-tertiary">:{portStatus.port}</span>
    </button>
  );
}
