import type { StateCreator } from "zustand";
import type { AppState } from "./index.js";

export interface PortStatusInfo {
  port: number;
  label: string;
  protocol: "http" | "tcp";
  status: "unknown" | "healthy" | "unhealthy";
  service?: string;
}

export interface EnvironmentSlice {
  /** Port health statuses keyed by session ID. */
  portStatuses: Map<string, PortStatusInfo[]>;
  /** Currently previewed port in the browser pane, keyed by session ID. */
  activePort: Map<string, number | null>;

  setPortStatuses: (sessionId: string, ports: PortStatusInfo[]) => void;
  setActivePort: (sessionId: string, port: number | null) => void;
  clearEnvironment: (sessionId: string) => void;
}

export const createEnvironmentSlice: StateCreator<AppState, [], [], EnvironmentSlice> = (set) => ({
  portStatuses: new Map(),
  activePort: new Map(),

  setPortStatuses: (sessionId, ports) =>
    set((state) => {
      const next = new Map(state.portStatuses);
      next.set(sessionId, ports);
      return { portStatuses: next };
    }),

  setActivePort: (sessionId, port) =>
    set((state) => {
      const next = new Map(state.activePort);
      next.set(sessionId, port);
      return { activePort: next };
    }),

  clearEnvironment: (sessionId) =>
    set((state) => {
      const nextPorts = new Map(state.portStatuses);
      nextPorts.delete(sessionId);
      const nextActive = new Map(state.activePort);
      nextActive.delete(sessionId);
      return { portStatuses: nextPorts, activePort: nextActive };
    }),
});
