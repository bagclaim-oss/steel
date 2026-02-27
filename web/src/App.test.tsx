// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// ─── Mock external modules ───────────────────────────────────────────────────

vi.mock("./analytics.js", () => ({
  capturePageView: vi.fn(),
}));

vi.mock("./ws.js", () => ({
  connectSession: vi.fn(),
}));

const mockApi = {
  getChangedFiles: vi.fn().mockResolvedValue({ files: [] }),
  checkForUpdate: vi.fn().mockResolvedValue({ updateAvailable: false }),
};

vi.mock("./api.js", () => ({
  api: {
    getChangedFiles: (...args: unknown[]) => mockApi.getChangedFiles(...args),
    checkForUpdate: (...args: unknown[]) => mockApi.checkForUpdate(...args),
  },
}));

// ─── Mock all child components to avoid deep dependency chains ───────────────
// This lets us test App's routing and layout logic without rendering every child.

vi.mock("./components/LoginPage.js", () => ({
  LoginPage: () => <div data-testid="login-page">LoginPage</div>,
}));

vi.mock("./components/Sidebar.js", () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock("./components/ChatView.js", () => ({
  ChatView: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="chat-view">ChatView:{sessionId}</div>
  ),
}));

vi.mock("./components/TopBar.js", () => ({
  TopBar: () => <div data-testid="top-bar">TopBar</div>,
}));

vi.mock("./components/HomePage.js", () => ({
  HomePage: () => <div data-testid="home-page">HomePage</div>,
}));

vi.mock("./components/TaskPanel.js", () => ({
  TaskPanel: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="task-panel">TaskPanel:{sessionId}</div>
  ),
}));

vi.mock("./components/DiffPanel.js", () => ({
  DiffPanel: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="diff-panel">DiffPanel:{sessionId}</div>
  ),
}));

vi.mock("./components/UpdateBanner.js", () => ({
  UpdateBanner: () => <div data-testid="update-banner">UpdateBanner</div>,
}));

vi.mock("./components/SessionLaunchOverlay.js", () => ({
  SessionLaunchOverlay: () => <div data-testid="session-launch-overlay">SessionLaunchOverlay</div>,
}));

vi.mock("./components/SessionTerminalDock.js", () => ({
  SessionTerminalDock: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="session-terminal-dock">{children}</div>
  ),
}));

vi.mock("./components/SessionEditorPane.js", () => ({
  SessionEditorPane: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="session-editor-pane">Editor:{sessionId}</div>
  ),
}));

vi.mock("./components/UpdateOverlay.js", () => ({
  UpdateOverlay: ({ active }: { active: boolean }) => (
    <div data-testid="update-overlay">{active ? "active" : "inactive"}</div>
  ),
}));

// Mock lazy-loaded components — they must return default export modules
vi.mock("./components/Playground.js", () => ({
  Playground: () => <div data-testid="playground">Playground</div>,
}));

vi.mock("./components/SettingsPage.js", () => ({
  SettingsPage: () => <div data-testid="settings-page">SettingsPage</div>,
}));

vi.mock("./components/IntegrationsPage.js", () => ({
  IntegrationsPage: () => <div data-testid="integrations-page">IntegrationsPage</div>,
}));

vi.mock("./components/LinearSettingsPage.js", () => ({
  LinearSettingsPage: () => <div data-testid="linear-settings">LinearSettings</div>,
}));

vi.mock("./components/DeepgramSettingsPage.js", () => ({
  DeepgramSettingsPage: () => <div data-testid="deepgram-settings">DeepgramSettings</div>,
}));

vi.mock("./components/PromptsPage.js", () => ({
  PromptsPage: () => <div data-testid="prompts-page">PromptsPage</div>,
}));

vi.mock("./components/EnvManager.js", () => ({
  EnvManager: () => <div data-testid="env-manager">EnvManager</div>,
}));

vi.mock("./components/CronManager.js", () => ({
  CronManager: () => <div data-testid="cron-manager">CronManager</div>,
}));

vi.mock("./components/AgentsPage.js", () => ({
  AgentsPage: () => <div data-testid="agents-page">AgentsPage</div>,
}));

vi.mock("./components/TerminalPage.js", () => ({
  TerminalPage: () => <div data-testid="terminal-page">TerminalPage</div>,
}));

vi.mock("./components/ProcessPanel.js", () => ({
  ProcessPanel: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="process-panel">ProcessPanel:{sessionId}</div>
  ),
}));

// Mock routing utilities — parseHash is the key function that controls rendering
vi.mock("./utils/routing.js", () => ({
  parseHash: vi.fn().mockReturnValue({ page: "home" }),
  navigateToSession: vi.fn(),
  sessionHash: vi.fn((id: string) => `#/session/${id}`),
}));

// ─── Mock store ──────────────────────────────────────────────────────────────

interface MockStoreState {
  isAuthenticated: boolean;
  darkMode: boolean;
  currentSessionId: string | null;
  sidebarOpen: boolean;
  taskPanelOpen: boolean;
  homeResetKey: number;
  activeTab: "chat" | "diff" | "terminal" | "processes" | "editor";
  setActiveTab: ReturnType<typeof vi.fn>;
  sessionCreating: boolean;
  sessionCreatingBackend: string | null;
  creationProgress: unknown[] | null;
  creationError: string | null;
  updateOverlayActive: boolean;
  changedFilesTick: Map<string, number>;
  diffBase: string;
  setGitChangedFilesCount: ReturnType<typeof vi.fn>;
  sessions: Map<string, { cwd?: string }>;
  sdkSessions: { sessionId: string; cwd?: string }[];
  setCurrentSession: ReturnType<typeof vi.fn>;
  setSidebarOpen: ReturnType<typeof vi.fn>;
  setTaskPanelOpen: ReturnType<typeof vi.fn>;
  clearCreation: ReturnType<typeof vi.fn>;
  setUpdateInfo: ReturnType<typeof vi.fn>;
  setSdkSessions: ReturnType<typeof vi.fn>;
}

let storeState: MockStoreState;

function resetStore(overrides: Partial<MockStoreState> = {}) {
  storeState = {
    isAuthenticated: true,
    darkMode: false,
    currentSessionId: null,
    sidebarOpen: false,
    taskPanelOpen: false,
    homeResetKey: 0,
    activeTab: "chat",
    setActiveTab: vi.fn(),
    sessionCreating: false,
    sessionCreatingBackend: null,
    creationProgress: null,
    creationError: null,
    updateOverlayActive: false,
    changedFilesTick: new Map(),
    diffBase: "HEAD",
    setGitChangedFilesCount: vi.fn(),
    sessions: new Map(),
    sdkSessions: [],
    setCurrentSession: vi.fn(),
    setSidebarOpen: vi.fn(),
    setTaskPanelOpen: vi.fn(),
    clearCreation: vi.fn(),
    setUpdateInfo: vi.fn(),
    setSdkSessions: vi.fn(),
    ...overrides,
  };
}

vi.mock("./store.js", () => ({
  useStore: Object.assign(
    (selector: (s: MockStoreState) => unknown) => selector(storeState),
    { getState: () => storeState },
  ),
}));

import App from "./App.js";
import { parseHash } from "./utils/routing.js";

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  window.location.hash = "";
  // Reset parseHash to return home by default
  vi.mocked(parseHash).mockReturnValue({ page: "home" });
});

afterEach(() => {
  window.location.hash = "";
});

// ─── Authentication gate ─────────────────────────────────────────────────────

describe("App authentication", () => {
  it("renders LoginPage when not authenticated", () => {
    // Validates the auth gate shows the login screen for unauthenticated users.
    resetStore({ isAuthenticated: false });
    render(<App />);
    expect(screen.getByTestId("login-page")).toBeTruthy();
  });

  it("does not render main layout when not authenticated", () => {
    // Validates that the main app shell (sidebar, topbar) is hidden for unauthenticated users.
    resetStore({ isAuthenticated: false });
    render(<App />);
    expect(screen.queryByTestId("sidebar")).toBeNull();
    expect(screen.queryByTestId("top-bar")).toBeNull();
  });
});

// ─── Home route ──────────────────────────────────────────────────────────────

describe("App home route", () => {
  it("renders the main layout with sidebar and topbar when authenticated", () => {
    // Validates the main app chrome renders on the home route.
    render(<App />);
    expect(screen.getByTestId("sidebar")).toBeTruthy();
    expect(screen.getByTestId("top-bar")).toBeTruthy();
    expect(screen.getByTestId("update-banner")).toBeTruthy();
  });

  it("renders HomePage when no session is selected", () => {
    // Validates the home page shows when there is no active session.
    render(<App />);
    expect(screen.getByTestId("home-page")).toBeTruthy();
  });
});

// ─── Session route ───────────────────────────────────────────────────────────

describe("App session route", () => {
  it("renders ChatView when a session is active with chat tab", async () => {
    // Validates the ChatView component renders for an active session on the chat tab.
    vi.mocked(parseHash).mockReturnValue({ page: "session", sessionId: "s1" });
    resetStore({
      currentSessionId: "s1",
      activeTab: "chat",
      sessions: new Map([["s1", { cwd: "/test" }]]),
    });

    render(<App />);
    expect(screen.getByTestId("chat-view")).toBeTruthy();
    expect(screen.getByText("ChatView:s1")).toBeTruthy();
  });

  it("renders DiffPanel when diff tab is active", async () => {
    // Validates the diff view shows when the diff tab is selected.
    vi.mocked(parseHash).mockReturnValue({ page: "session", sessionId: "s1" });
    resetStore({
      currentSessionId: "s1",
      activeTab: "diff",
      sessions: new Map([["s1", { cwd: "/test" }]]),
    });

    render(<App />);
    expect(screen.getByTestId("diff-panel")).toBeTruthy();
  });

  it("renders SessionTerminalDock when terminal tab is active", async () => {
    // Validates the terminal dock renders for the terminal tab.
    vi.mocked(parseHash).mockReturnValue({ page: "session", sessionId: "s1" });
    resetStore({
      currentSessionId: "s1",
      activeTab: "terminal",
      sessions: new Map([["s1", { cwd: "/test" }]]),
    });

    render(<App />);
    expect(screen.getByTestId("session-terminal-dock")).toBeTruthy();
  });

  it("renders SessionEditorPane when editor tab is active", async () => {
    // Validates the editor pane renders when the editor tab is selected.
    vi.mocked(parseHash).mockReturnValue({ page: "session", sessionId: "s1" });
    resetStore({
      currentSessionId: "s1",
      activeTab: "editor",
      sessions: new Map([["s1", { cwd: "/test" }]]),
    });

    render(<App />);
    expect(screen.getByTestId("session-editor-pane")).toBeTruthy();
  });

  it("renders ProcessPanel when processes tab is active", async () => {
    // Validates the process panel renders for the processes tab.
    vi.mocked(parseHash).mockReturnValue({ page: "session", sessionId: "s1" });
    resetStore({
      currentSessionId: "s1",
      activeTab: "processes",
      sessions: new Map([["s1", { cwd: "/test" }]]),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("process-panel")).toBeTruthy();
    });
  });

  it("renders TaskPanel when a session is active and task panel is open", () => {
    // Validates the task panel renders alongside the session view.
    vi.mocked(parseHash).mockReturnValue({ page: "session", sessionId: "s1" });
    resetStore({
      currentSessionId: "s1",
      taskPanelOpen: true,
      sessions: new Map([["s1", { cwd: "/test" }]]),
    });

    render(<App />);
    expect(screen.getByTestId("task-panel")).toBeTruthy();
  });
});

// ─── Settings route ──────────────────────────────────────────────────────────

describe("App settings route", () => {
  it("renders SettingsPage for #/settings", async () => {
    // Validates the settings page renders when navigated to.
    vi.mocked(parseHash).mockReturnValue({ page: "settings" });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("settings-page")).toBeTruthy();
    });
  });
});

// ─── Prompts route ───────────────────────────────────────────────────────────

describe("App prompts route", () => {
  it("renders PromptsPage for #/prompts", async () => {
    // Validates the prompts page renders when navigated to.
    vi.mocked(parseHash).mockReturnValue({ page: "prompts" });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("prompts-page")).toBeTruthy();
    });
  });
});

// ─── Integrations routes ─────────────────────────────────────────────────────

describe("App integrations routes", () => {
  it("renders IntegrationsPage for #/integrations", async () => {
    // Validates the integrations hub page renders.
    vi.mocked(parseHash).mockReturnValue({ page: "integrations" });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("integrations-page")).toBeTruthy();
    });
  });

  it("renders LinearSettingsPage for #/integrations/linear", async () => {
    // Validates the Linear integration page renders.
    vi.mocked(parseHash).mockReturnValue({ page: "integration-linear" });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("linear-settings")).toBeTruthy();
    });
  });

  it("renders DeepgramSettingsPage for #/integrations/deepgram", async () => {
    // Validates the Deepgram integration page renders.
    vi.mocked(parseHash).mockReturnValue({ page: "integration-deepgram" });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("deepgram-settings")).toBeTruthy();
    });
  });
});

// ─── Terminal route ──────────────────────────────────────────────────────────

describe("App terminal route", () => {
  it("renders TerminalPage for #/terminal", async () => {
    // Validates the terminal page renders when navigated to.
    vi.mocked(parseHash).mockReturnValue({ page: "terminal" });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("terminal-page")).toBeTruthy();
    });
  });
});

// ─── Environments route ──────────────────────────────────────────────────────

describe("App environments route", () => {
  it("renders EnvManager for #/environments", async () => {
    // Validates the environment manager renders when navigated to.
    vi.mocked(parseHash).mockReturnValue({ page: "environments" });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("env-manager")).toBeTruthy();
    });
  });
});

// ─── Agents route ────────────────────────────────────────────────────────────

describe("App agents route", () => {
  it("renders AgentsPage for #/agents", async () => {
    // Validates the agents page renders when navigated to.
    vi.mocked(parseHash).mockReturnValue({ page: "agents" });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("agents-page")).toBeTruthy();
    });
  });

  it("renders AgentsPage for agent-detail route", async () => {
    // Validates the agent detail view renders via the agents page.
    vi.mocked(parseHash).mockReturnValue({ page: "agent-detail", agentId: "a1" });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("agents-page")).toBeTruthy();
    });
  });
});

// ─── Playground route ────────────────────────────────────────────────────────

describe("App playground route", () => {
  it("renders Playground for #/playground", async () => {
    // Validates the component playground renders (standalone, no sidebar).
    vi.mocked(parseHash).mockReturnValue({ page: "playground" });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("playground")).toBeTruthy();
    });
    // Playground renders standalone without sidebar
    expect(screen.queryByTestId("sidebar")).toBeNull();
  });
});

// ─── Dark mode ───────────────────────────────────────────────────────────────

describe("App dark mode", () => {
  it("toggles dark class on document element based on darkMode store state", () => {
    // Validates the dark mode CSS class is applied to the document root.
    resetStore({ darkMode: true });
    render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes dark class when darkMode is false", () => {
    // Validates dark mode class is removed when disabled.
    document.documentElement.classList.add("dark");
    resetStore({ darkMode: false });
    render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

// ─── Update overlay ──────────────────────────────────────────────────────────

describe("App update overlay", () => {
  it("renders UpdateOverlay component", () => {
    // Validates the update overlay is always present in the DOM.
    render(<App />);
    expect(screen.getByTestId("update-overlay")).toBeTruthy();
  });

  it("passes active state to UpdateOverlay", () => {
    // Validates the overlay receives the correct active prop.
    resetStore({ updateOverlayActive: true });
    render(<App />);
    expect(screen.getByText("active")).toBeTruthy();
  });
});

// ─── Session launch overlay ──────────────────────────────────────────────────

describe("App session launch overlay", () => {
  it("renders SessionLaunchOverlay when session is being created", () => {
    // Validates the launch overlay appears during session creation.
    vi.mocked(parseHash).mockReturnValue({ page: "home" });
    resetStore({
      sessionCreating: true,
      creationProgress: [{ label: "Starting...", status: "done" }],
    });

    render(<App />);
    expect(screen.getByTestId("session-launch-overlay")).toBeTruthy();
  });

  it("does not render SessionLaunchOverlay when not creating", () => {
    // Validates the overlay is hidden when no session is being created.
    render(<App />);
    expect(screen.queryByTestId("session-launch-overlay")).toBeNull();
  });
});

// ─── Sidebar overlay ─────────────────────────────────────────────────────────

describe("App sidebar", () => {
  it("renders mobile overlay backdrop when sidebar is open", () => {
    // Validates the dark overlay backdrop renders behind the sidebar on mobile.
    resetStore({ sidebarOpen: true });
    const { container } = render(<App />);

    // The overlay backdrop has bg-black/30 class
    const backdrop = container.querySelector(".bg-black\\/30");
    expect(backdrop).toBeTruthy();
  });
});

// ─── Context panel toggle ────────────────────────────────────────────────────

describe("App task panel", () => {
  it("shows 'Open context panel' button when task panel is closed and session active", () => {
    // Validates the collapsed context panel shows a toggle button.
    vi.mocked(parseHash).mockReturnValue({ page: "session", sessionId: "s1" });
    resetStore({
      currentSessionId: "s1",
      taskPanelOpen: false,
      sessions: new Map([["s1", { cwd: "/test" }]]),
    });

    render(<App />);
    expect(screen.getByTitle("Open context panel")).toBeTruthy();
  });

  it("renders task panel overlay backdrop when panel is open on mobile", () => {
    // Validates the dark overlay appears behind the task panel on small screens.
    vi.mocked(parseHash).mockReturnValue({ page: "session", sessionId: "s1" });
    resetStore({
      currentSessionId: "s1",
      taskPanelOpen: true,
      sessions: new Map([["s1", { cwd: "/test" }]]),
    });

    const { container } = render(<App />);
    // Two backdrops may exist (sidebar + task panel); at least one for task panel
    const backdrops = container.querySelectorAll(".bg-black\\/30");
    expect(backdrops.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Accessibility ───────────────────────────────────────────────────────────

describe("App accessibility", () => {
  it("passes axe accessibility checks on home route", async () => {
    const { axe } = await import("vitest-axe");
    const { container } = render(<App />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
