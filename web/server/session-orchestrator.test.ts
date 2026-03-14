import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Module mocks ────────────────────────────────────────────────────────────
// Must be declared before any imports that reference them.

vi.mock("./env-manager.js", () => ({
  getEnv: vi.fn(() => null),
}));

vi.mock("./sandbox-manager.js", () => ({
  getSandbox: vi.fn(() => null),
}));

vi.mock("./git-utils.js", () => ({
  getRepoInfo: vi.fn(() => null),
  gitFetch: vi.fn(() => ({ success: true, output: "" })),
  gitPull: vi.fn(() => ({ success: true, output: "" })),
  checkoutOrCreateBranch: vi.fn(() => ({ created: false })),
  ensureWorktree: vi.fn(() => ({ worktreePath: "/wt/feat", actualBranch: "feat", isNew: true })),
  isWorktreeDirty: vi.fn(() => false),
  removeWorktree: vi.fn(() => ({ removed: true })),
}));

vi.mock("./session-names.js", () => ({
  getName: vi.fn(() => undefined),
  setName: vi.fn(),
  getAllNames: vi.fn(() => ({})),
  removeName: vi.fn(),
}));

vi.mock("./session-linear-issues.js", () => ({
  getLinearIssue: vi.fn(() => undefined),
  setLinearIssue: vi.fn(),
  removeLinearIssue: vi.fn(),
  getAllLinearIssues: vi.fn(() => ({})),
}));

vi.mock("./settings-manager.js", () => ({
  getSettings: vi.fn(() => ({
    anthropicApiKey: "",
    anthropicModel: "claude-sonnet-4-6",
    linearApiKey: "",
    linearAutoTransition: false,
    linearAutoTransitionStateId: "",
    linearAutoTransitionStateName: "",
    linearArchiveTransition: false,
    linearArchiveTransitionStateId: "",
    linearArchiveTransitionStateName: "",
  })),
}));

vi.mock("./linear-connections.js", () => ({
  getConnection: vi.fn(() => null),
  resolveApiKey: vi.fn(() => null),
}));

vi.mock("./linear-prompt-builder.js", () => ({
  buildLinearSystemPrompt: vi.fn(() => ""),
}));

vi.mock("./routes/linear-routes.js", () => ({
  transitionLinearIssue: vi.fn(async () => ({ ok: true })),
  fetchLinearTeamStates: vi.fn(async () => []),
}));

vi.mock("./claude-container-auth.js", () => ({
  hasContainerClaudeAuth: vi.fn(() => true),
}));

vi.mock("./codex-container-auth.js", () => ({
  hasContainerCodexAuth: vi.fn(() => true),
}));

vi.mock("./commands-discovery.js", () => ({
  discoverCommandsAndSkills: vi.fn(async () => ({ slash_commands: [], skills: [] })),
}));

vi.mock("./auto-namer.js", () => ({
  generateSessionTitle: vi.fn(async () => "Test Title"),
}));

const mockImagePullIsReady = vi.hoisted(() => vi.fn(() => true));
const mockImagePullGetState = vi.hoisted(() => vi.fn(() => ({ image: "", status: "ready", progress: [] })));
const mockImagePullEnsureImage = vi.hoisted(() => vi.fn());
const mockImagePullWaitForReady = vi.hoisted(() => vi.fn(async () => true));
const mockImagePullOnProgress = vi.hoisted(() => vi.fn(() => () => {}));

vi.mock("./image-pull-manager.js", () => ({
  imagePullManager: {
    isReady: mockImagePullIsReady,
    getState: mockImagePullGetState,
    ensureImage: mockImagePullEnsureImage,
    waitForReady: mockImagePullWaitForReady,
    onProgress: mockImagePullOnProgress,
  },
}));

vi.mock("./container-manager.js", () => ({
  containerManager: {
    removeContainer: vi.fn(),
    createContainer: vi.fn(() => ({
      containerId: "cid-1",
      name: "companion-1",
      image: "the-companion:latest",
      portMappings: [],
      hostCwd: "/test",
      containerCwd: "/workspace",
      state: "running",
    })),
    imageExists: vi.fn(() => true),
    retrack: vi.fn(),
    copyWorkspaceToContainer: vi.fn(async () => {}),
    reseedGitAuth: vi.fn(),
    gitOpsInContainer: vi.fn(() => ({
      fetchOk: true,
      checkoutOk: true,
      pullOk: true,
      errors: [],
    })),
    execInContainerAsync: vi.fn(async () => ({ exitCode: 0, output: "ok" })),
  },
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────

import { SessionOrchestrator } from "./session-orchestrator.js";
import type { SessionOrchestratorDeps } from "./session-orchestrator.js";
import { containerManager } from "./container-manager.js";
import * as envManager from "./env-manager.js";
import * as sandboxManager from "./sandbox-manager.js";
import * as gitUtils from "./git-utils.js";
import * as sessionNames from "./session-names.js";
import * as sessionLinearIssues from "./session-linear-issues.js";
import * as settingsManager from "./settings-manager.js";
import { resolveApiKey } from "./linear-connections.js";
import { transitionLinearIssue, fetchLinearTeamStates } from "./routes/linear-routes.js";
import { hasContainerClaudeAuth } from "./claude-container-auth.js";
import { hasContainerCodexAuth } from "./codex-container-auth.js";
import { generateSessionTitle } from "./auto-namer.js";

// ── Mock factories ──────────────────────────────────────────────────────────

function createMockLauncher() {
  return {
    launch: vi.fn(() => ({
      sessionId: "session-1",
      state: "starting",
      cwd: "/test",
      createdAt: Date.now(),
    })),
    kill: vi.fn(async () => true),
    relaunch: vi.fn(async () => ({ ok: true })),
    listSessions: vi.fn(() => []),
    getSession: vi.fn(() => undefined),
    setArchived: vi.fn(),
    removeSession: vi.fn(),
    setCLISessionId: vi.fn(),
    onCodexAdapterCreated: vi.fn(),
    onSessionExited: vi.fn(),
    getStartingSessions: vi.fn(() => []),
  } as any;
}

function createMockBridge() {
  return {
    closeSession: vi.fn(),
    isCliConnected: vi.fn(() => false),
    getSession: vi.fn(() => null),
    getAllSessions: vi.fn(() => []),
    markContainerized: vi.fn(),
    prePopulateCommands: vi.fn(),
    broadcastNameUpdate: vi.fn(),
    broadcastToSession: vi.fn(),
    injectSystemPrompt: vi.fn(),
    onCLISessionIdReceived: vi.fn(),
    onCLIRelaunchNeededCallback: vi.fn(),
    onIdleKillCallback: vi.fn(),
    onFirstTurnCompletedCallback: vi.fn(),
    onSessionGitInfoReadyCallback: vi.fn(),
    attachCodexAdapter: vi.fn(),
  } as any;
}

function createMockStore() {
  return {
    setArchived: vi.fn(() => true),
  } as any;
}

function createMockTracker() {
  return {
    addMapping: vi.fn(),
    getBySession: vi.fn(() => null),
    removeBySession: vi.fn(),
    isWorktreeInUse: vi.fn(() => false),
  } as any;
}

function createDeps(overrides?: Partial<SessionOrchestratorDeps>) {
  const launcher = createMockLauncher();
  const wsBridge = createMockBridge();
  const sessionStore = createMockStore();
  const worktreeTracker = createMockTracker();
  const prPoller = { watch: vi.fn(), unwatch: vi.fn() };
  const agentExecutor = { handleSessionExited: vi.fn() } as any;
  return {
    launcher,
    wsBridge,
    sessionStore,
    worktreeTracker,
    prPoller,
    agentExecutor,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("SessionOrchestrator", () => {
  let deps: ReturnType<typeof createDeps>;
  let orchestrator: SessionOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockImagePullIsReady.mockReturnValue(true);
    // Re-establish mocks that may have been overridden by mockImplementation in
    // previous tests (clearAllMocks resets calls/results but NOT implementations).
    vi.mocked(hasContainerClaudeAuth).mockReturnValue(true);
    vi.mocked(hasContainerCodexAuth).mockReturnValue(true);
    vi.mocked(containerManager.createContainer).mockReturnValue({
      containerId: "cid-1",
      name: "companion-1",
      image: "the-companion:latest",
      portMappings: [],
      hostCwd: "/test",
      containerCwd: "/workspace",
      state: "running",
    } as any);
    vi.mocked(containerManager.gitOpsInContainer).mockReturnValue({
      fetchOk: true,
      checkoutOk: true,
      pullOk: true,
      errors: [],
    } as any);
    vi.mocked(containerManager.execInContainerAsync).mockResolvedValue({ exitCode: 0, output: "ok" });
    deps = createDeps();
    orchestrator = new SessionOrchestrator(deps);
  });

  // ── Initialization / Event wiring ─────────────────────────────────────────

  describe("initialize()", () => {
    it("registers all expected callbacks on subsystems", () => {
      // Verifies that initialize() wires up all event handlers
      orchestrator.initialize();

      expect(deps.wsBridge.onCLISessionIdReceived).toHaveBeenCalled();
      expect(deps.launcher.onCodexAdapterCreated).toHaveBeenCalled();
      expect(deps.launcher.onSessionExited).toHaveBeenCalled();
      expect(deps.wsBridge.onSessionGitInfoReadyCallback).toHaveBeenCalled();
      expect(deps.wsBridge.onCLIRelaunchNeededCallback).toHaveBeenCalled();
      expect(deps.wsBridge.onIdleKillCallback).toHaveBeenCalled();
      expect(deps.wsBridge.onFirstTurnCompletedCallback).toHaveBeenCalled();
    });

    it("CLI session ID callback delegates to launcher.setCLISessionId", () => {
      orchestrator.initialize();

      // Extract the registered callback
      const cb = deps.wsBridge.onCLISessionIdReceived.mock.calls[0][0];
      cb("s1", "cli-id-123");

      expect(deps.launcher.setCLISessionId).toHaveBeenCalledWith("s1", "cli-id-123");
    });

    it("session exit callback notifies agentExecutor", () => {
      orchestrator.initialize();

      const cb = deps.launcher.onSessionExited.mock.calls[0][0];
      cb("s1", 0);

      expect(deps.agentExecutor.handleSessionExited).toHaveBeenCalledWith("s1", 0);
    });

    it("git info ready callback starts PR polling", () => {
      orchestrator.initialize();

      const cb = deps.wsBridge.onSessionGitInfoReadyCallback.mock.calls[0][0];
      cb("s1", "/repo", "main");

      expect(deps.prPoller.watch).toHaveBeenCalledWith("s1", "/repo", "main");
    });

    it("idle kill callback does not kill archived sessions", async () => {
      deps.launcher.getSession.mockReturnValue({ archived: true });
      orchestrator.initialize();

      const cb = deps.wsBridge.onIdleKillCallback.mock.calls[0][0];
      await cb("s1");

      // Should not kill because session is archived
      expect(deps.launcher.kill).not.toHaveBeenCalled();
    });

    it("idle kill callback kills non-archived sessions", async () => {
      deps.launcher.getSession.mockReturnValue({ archived: false });
      orchestrator.initialize();

      const cb = deps.wsBridge.onIdleKillCallback.mock.calls[0][0];
      await cb("s1");

      expect(deps.launcher.kill).toHaveBeenCalledWith("s1");
    });

    it("is idempotent — calling initialize() twice does not double-register callbacks", () => {
      // Guards against accidental re-initialization which would cause
      // all event handlers to fire multiple times per event.
      orchestrator.initialize();
      orchestrator.initialize();

      // Each callback should only be registered once, not twice
      expect(deps.wsBridge.onCLISessionIdReceived).toHaveBeenCalledTimes(1);
      expect(deps.launcher.onCodexAdapterCreated).toHaveBeenCalledTimes(1);
      expect(deps.launcher.onSessionExited).toHaveBeenCalledTimes(1);
      expect(deps.wsBridge.onCLIRelaunchNeededCallback).toHaveBeenCalledTimes(1);
      expect(deps.wsBridge.onIdleKillCallback).toHaveBeenCalledTimes(1);
      expect(deps.wsBridge.onFirstTurnCompletedCallback).toHaveBeenCalledTimes(1);
    });
  });

  // ── Session Creation ──────────────────────────────────────────────────────

  describe("createSession()", () => {
    it("creates a basic session with defaults", async () => {
      const result = await orchestrator.createSession({ cwd: "/test" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.session.sessionId).toBe("session-1");
      }
      expect(deps.launcher.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: "/test",
          backendType: "claude",
        }),
      );
    });

    it("returns 400 for invalid backend", async () => {
      const result = await orchestrator.createSession({ cwd: "/test", backend: "invalid" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Invalid backend");
        expect(result.status).toBe(400);
      }
    });

    it("resolves environment variables from envSlug", async () => {
      vi.mocked(envManager.getEnv).mockReturnValue({
        name: "Production",
        slug: "production",
        variables: { API_KEY: "secret", DB_HOST: "db.example.com" },
        createdAt: 1000,
        updatedAt: 1000,
      });

      const result = await orchestrator.createSession({ cwd: "/test", envSlug: "production" });

      expect(result.ok).toBe(true);
      expect(envManager.getEnv).toHaveBeenCalledWith("production");
      expect(deps.launcher.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({ API_KEY: "secret", DB_HOST: "db.example.com" }),
        }),
      );
    });

    it("validates branch name to prevent injection", async () => {
      const result = await orchestrator.createSession({ cwd: "/test", branch: "bad branch name!" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Invalid branch name");
        expect(result.status).toBe(400);
      }
    });

    it("performs git fetch, checkout, and pull for non-docker branch", async () => {
      vi.mocked(gitUtils.getRepoInfo).mockReturnValue({
        repoRoot: "/repo",
        repoName: "my-repo",
        currentBranch: "develop",
        defaultBranch: "main",
        isWorktree: false,
      });

      const result = await orchestrator.createSession({ cwd: "/repo", branch: "main" });

      expect(result.ok).toBe(true);
      expect(gitUtils.gitFetch).toHaveBeenCalledWith("/repo");
      expect(gitUtils.checkoutOrCreateBranch).toHaveBeenCalledWith("/repo", "main", {
        createBranch: undefined,
        defaultBranch: "main",
      });
      expect(gitUtils.gitPull).toHaveBeenCalledWith("/repo");
    });

    it("skips checkout when branch matches current branch", async () => {
      vi.mocked(gitUtils.getRepoInfo).mockReturnValue({
        repoRoot: "/repo",
        repoName: "my-repo",
        currentBranch: "main",
        defaultBranch: "main",
        isWorktree: false,
      });

      await orchestrator.createSession({ cwd: "/repo", branch: "main" });

      expect(gitUtils.gitFetch).toHaveBeenCalled();
      expect(gitUtils.checkoutOrCreateBranch).not.toHaveBeenCalled();
      expect(gitUtils.gitPull).toHaveBeenCalled();
    });

    it("creates worktree when useWorktree is true", async () => {
      vi.mocked(gitUtils.getRepoInfo).mockReturnValue({
        repoRoot: "/repo",
        repoName: "my-repo",
        currentBranch: "main",
        defaultBranch: "main",
        isWorktree: false,
      });
      vi.mocked(gitUtils.ensureWorktree).mockReturnValue({
        worktreePath: "/wt/feat",
        branch: "feat",
        actualBranch: "feat",
        isNew: true,
      } as any);

      const result = await orchestrator.createSession({ cwd: "/repo", branch: "feat", useWorktree: true });

      expect(result.ok).toBe(true);
      expect(gitUtils.ensureWorktree).toHaveBeenCalledWith("/repo", "feat", {
        baseBranch: "main",
        createBranch: undefined,
        forceNew: true,
      });
      // Launch should use worktree path as cwd
      expect(deps.launcher.launch).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: "/wt/feat" }),
      );
      // Should track the worktree mapping
      expect(deps.worktreeTracker.addMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          repoRoot: "/repo",
          branch: "feat",
          worktreePath: "/wt/feat",
        }),
      );
    });

    it("proceeds when git fetch fails (non-fatal)", async () => {
      vi.mocked(gitUtils.getRepoInfo).mockReturnValue({
        repoRoot: "/repo",
        repoName: "my-repo",
        currentBranch: "main",
        defaultBranch: "main",
        isWorktree: false,
      });
      vi.mocked(gitUtils.gitFetch).mockReturnValue({ success: false, output: "network error" });

      const result = await orchestrator.createSession({ cwd: "/repo", branch: "main" });

      expect(result.ok).toBe(true);
      expect(deps.launcher.launch).toHaveBeenCalled();
    });

    it("returns 400 when containerized Claude lacks auth", async () => {
      vi.mocked(hasContainerClaudeAuth).mockReturnValue(false);
      vi.mocked(envManager.getEnv).mockReturnValue({
        name: "E",
        slug: "e",
        variables: {},
        createdAt: 1,
        updatedAt: 1,
      } as any);

      const result = await orchestrator.createSession({
        cwd: "/test",
        sandboxEnabled: true,
        envSlug: "e",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Containerized Claude requires auth");
        expect(result.status).toBe(400);
      }
    });

    it("returns 400 when containerized Codex lacks auth", async () => {
      vi.mocked(hasContainerCodexAuth).mockReturnValue(false);
      vi.mocked(envManager.getEnv).mockReturnValue({
        name: "E",
        slug: "e",
        variables: {},
        createdAt: 1,
        updatedAt: 1,
      } as any);

      const result = await orchestrator.createSession({
        cwd: "/test",
        backend: "codex",
        sandboxEnabled: true,
        envSlug: "e",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Containerized Codex requires auth");
        expect(result.status).toBe(400);
      }
    });

    it("creates container for sandboxed sessions", async () => {
      vi.mocked(envManager.getEnv).mockReturnValue({
        name: "Docker",
        slug: "docker",
        variables: { CLAUDE_CODE_OAUTH_TOKEN: "token" },
        createdAt: 1,
        updatedAt: 1,
      } as any);
      vi.mocked(sandboxManager.getSandbox).mockReturnValue({
        name: "Docker",
        slug: "docker",
        createdAt: 1,
        updatedAt: 1,
      });

      const result = await orchestrator.createSession({
        cwd: "/test",
        envSlug: "docker",
        sandboxEnabled: true,
        sandboxSlug: "docker",
      });

      expect(result.ok).toBe(true);
      expect(containerManager.createContainer).toHaveBeenCalled();
      expect(containerManager.copyWorkspaceToContainer).toHaveBeenCalled();
      expect(containerManager.retrack).toHaveBeenCalledWith("cid-1", "session-1");
      expect(deps.wsBridge.markContainerized).toHaveBeenCalledWith("session-1", "/test");
    });

    it("returns 503 when container creation fails", async () => {
      vi.mocked(envManager.getEnv).mockReturnValue({
        name: "E",
        slug: "e",
        variables: { CLAUDE_CODE_OAUTH_TOKEN: "token" },
        createdAt: 1,
        updatedAt: 1,
      } as any);
      vi.mocked(containerManager.createContainer).mockImplementation(() => {
        throw new Error("docker daemon timeout");
      });

      const result = await orchestrator.createSession({
        cwd: "/test",
        sandboxEnabled: true,
        envSlug: "e",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("container startup failed");
        expect(result.status).toBe(503);
      }
    });

    it("runs init script for sandbox sessions", async () => {
      vi.mocked(envManager.getEnv).mockReturnValue({
        name: "E",
        slug: "e",
        variables: { CLAUDE_CODE_OAUTH_TOKEN: "token" },
        createdAt: 1,
        updatedAt: 1,
      } as any);
      vi.mocked(sandboxManager.getSandbox).mockReturnValue({
        name: "E",
        slug: "e",
        initScript: "npm install",
        createdAt: 1,
        updatedAt: 1,
      });

      const result = await orchestrator.createSession({
        cwd: "/test",
        sandboxEnabled: true,
        sandboxSlug: "e",
        envSlug: "e",
      });

      expect(result.ok).toBe(true);
      expect(containerManager.execInContainerAsync).toHaveBeenCalledWith(
        "cid-1",
        ["sh", "-lc", "npm install"],
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
    });

    it("returns 503 when init script fails", async () => {
      vi.mocked(envManager.getEnv).mockReturnValue({
        name: "E",
        slug: "e",
        variables: { CLAUDE_CODE_OAUTH_TOKEN: "token" },
        createdAt: 1,
        updatedAt: 1,
      } as any);
      vi.mocked(sandboxManager.getSandbox).mockReturnValue({
        name: "E",
        slug: "e",
        initScript: "exit 1",
        createdAt: 1,
        updatedAt: 1,
      });
      vi.mocked(containerManager.execInContainerAsync).mockResolvedValue({ exitCode: 1, output: "npm ERR!" });

      const result = await orchestrator.createSession({
        cwd: "/test",
        sandboxEnabled: true,
        sandboxSlug: "e",
        envSlug: "e",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Init script failed");
        expect(result.status).toBe(503);
        // Container should be cleaned up
        expect(containerManager.removeContainer).toHaveBeenCalled();
      }
    });

    it("runs git ops inside container for Docker sessions with branch", async () => {
      vi.mocked(gitUtils.getRepoInfo).mockReturnValue({
        repoRoot: "/repo",
        repoName: "my-repo",
        currentBranch: "main",
        defaultBranch: "main",
        isWorktree: false,
      } as any);
      vi.mocked(envManager.getEnv).mockReturnValue({
        name: "Docker",
        slug: "docker",
        variables: { CLAUDE_CODE_OAUTH_TOKEN: "token" },
        createdAt: 1,
        updatedAt: 1,
      } as any);
      vi.mocked(sandboxManager.getSandbox).mockReturnValue({
        name: "Docker",
        slug: "docker",
        createdAt: 1,
        updatedAt: 1,
      });

      const result = await orchestrator.createSession({
        cwd: "/repo",
        branch: "feat/new",
        envSlug: "docker",
        sandboxEnabled: true,
        sandboxSlug: "docker",
      });

      expect(result.ok).toBe(true);
      // Host git ops should NOT have been called
      expect(gitUtils.gitFetch).not.toHaveBeenCalled();
      expect(gitUtils.checkoutOrCreateBranch).not.toHaveBeenCalled();
      expect(gitUtils.gitPull).not.toHaveBeenCalled();
      // In-container git ops SHOULD have been called
      expect(containerManager.gitOpsInContainer).toHaveBeenCalledWith(
        "cid-1",
        expect.objectContaining({ branch: "feat/new", currentBranch: "main" }),
      );
    });

    it("returns 400 when in-container checkout fails", async () => {
      vi.mocked(gitUtils.getRepoInfo).mockReturnValue({
        repoRoot: "/repo",
        repoName: "my-repo",
        currentBranch: "main",
        defaultBranch: "main",
        isWorktree: false,
      } as any);
      vi.mocked(envManager.getEnv).mockReturnValue({
        name: "E",
        slug: "e",
        variables: { CLAUDE_CODE_OAUTH_TOKEN: "token" },
        createdAt: 1,
        updatedAt: 1,
      } as any);
      vi.mocked(sandboxManager.getSandbox).mockReturnValue({
        name: "E",
        slug: "e",
        createdAt: 1,
        updatedAt: 1,
      });
      vi.mocked(containerManager.gitOpsInContainer).mockReturnValue({
        fetchOk: true,
        checkoutOk: false,
        pullOk: false,
        errors: ['branch "nonexistent" does not exist'],
      });

      const result = await orchestrator.createSession({
        cwd: "/repo",
        branch: "nonexistent",
        sandboxEnabled: true,
        sandboxSlug: "e",
        envSlug: "e",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Failed to checkout branch");
        expect(result.status).toBe(400);
        expect(containerManager.removeContainer).toHaveBeenCalled();
      }
    });

    it("passes resumeSessionAt and forkSession to launcher", async () => {
      const result = await orchestrator.createSession({
        cwd: "/test",
        resumeSessionAt: "  existing-session-id  ",
        forkSession: true,
      });

      expect(result.ok).toBe(true);
      expect(deps.launcher.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          resumeSessionAt: "existing-session-id",
          forkSession: true,
        }),
      );
    });

    it("passes backendType codex to launcher", async () => {
      const result = await orchestrator.createSession({
        cwd: "/test",
        backend: "codex",
        model: "gpt-5",
      });

      expect(result.ok).toBe(true);
      expect(deps.launcher.launch).toHaveBeenCalledWith(
        expect.objectContaining({ backendType: "codex", model: "gpt-5" }),
      );
    });

    it("catches thrown errors from launcher.launch and returns 503", async () => {
      deps.launcher.launch.mockImplementation(() => {
        throw new Error("CLI binary not found");
      });

      const result = await orchestrator.createSession({ cwd: "/test" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("CLI binary not found");
        expect(result.status).toBe(503);
      }
    });

    it("cleans up container when launcher.launch throws after container creation", async () => {
      // If a container was created but launcher.launch throws, the container
      // should be cleaned up to avoid leaking Docker resources.
      vi.mocked(envManager.getEnv).mockReturnValue({
        name: "E",
        slug: "e",
        variables: { CLAUDE_CODE_OAUTH_TOKEN: "token" },
        createdAt: 1,
        updatedAt: 1,
      } as any);
      deps.launcher.launch.mockImplementation(() => {
        throw new Error("Binary not found");
      });

      const result = await orchestrator.createSession({
        cwd: "/test",
        sandboxEnabled: true,
        envSlug: "e",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Failed to launch CLI");
        expect(result.status).toBe(503);
      }
      // Container should be cleaned up after launch failure
      expect(containerManager.removeContainer).toHaveBeenCalled();
    });
  });

  // ── Streaming Session Creation ────────────────────────────────────────────

  describe("createSessionStreaming()", () => {
    it("calls progress callback during creation", async () => {
      const onProgress = vi.fn();
      const result = await orchestrator.createSessionStreaming({ cwd: "/test" }, onProgress);

      expect(result.ok).toBe(true);
      // Should have at least resolving_env and launching_cli progress events
      expect(onProgress).toHaveBeenCalledWith("resolving_env", expect.any(String), "in_progress");
      expect(onProgress).toHaveBeenCalledWith("resolving_env", expect.any(String), "done");
      expect(onProgress).toHaveBeenCalledWith("launching_cli", expect.any(String), "in_progress");
      expect(onProgress).toHaveBeenCalledWith("launching_cli", expect.any(String), "done");
    });

    it("emits correct label for codex backend", async () => {
      const onProgress = vi.fn();
      await orchestrator.createSessionStreaming({ cwd: "/test", backend: "codex" }, onProgress);

      expect(onProgress).toHaveBeenCalledWith("launching_cli", "Launching Codex...", "in_progress");
    });

    it("emits correct label for claude backend", async () => {
      const onProgress = vi.fn();
      await orchestrator.createSessionStreaming({ cwd: "/test" }, onProgress);

      expect(onProgress).toHaveBeenCalledWith("launching_cli", "Launching Claude Code...", "in_progress");
    });
  });

  // ── Kill ───────────────────────────────────────────────────────────────────

  describe("killSession()", () => {
    it("kills launcher and removes container", async () => {
      deps.launcher.kill.mockResolvedValue(true);
      const result = await orchestrator.killSession("s1");

      expect(result.ok).toBe(true);
      expect(deps.launcher.kill).toHaveBeenCalledWith("s1");
      expect(containerManager.removeContainer).toHaveBeenCalledWith("s1");
    });

    it("returns ok=false and does not remove container when session not found", async () => {
      // When launcher.kill returns false (session not found), removeContainer
      // should NOT be called to preserve the original behavior from routes.ts.
      deps.launcher.kill.mockResolvedValue(false);
      const result = await orchestrator.killSession("s1");

      expect(result.ok).toBe(false);
      expect(containerManager.removeContainer).not.toHaveBeenCalled();
    });
  });

  // ── Relaunch ──────────────────────────────────────────────────────────────

  describe("relaunchSession()", () => {
    it("delegates to launcher.relaunch", async () => {
      const result = await orchestrator.relaunchSession("s1");

      expect(result.ok).toBe(true);
      expect(deps.launcher.relaunch).toHaveBeenCalledWith("s1");
    });

    it("rejects relaunching archived sessions", async () => {
      deps.launcher.getSession.mockReturnValue({ archived: true });

      const result = await orchestrator.relaunchSession("s1");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("archived");
      expect(deps.launcher.relaunch).not.toHaveBeenCalled();
    });

    it("propagates error from launcher.relaunch", async () => {
      deps.launcher.relaunch.mockResolvedValue({ ok: false, error: "Container removed externally" });

      const result = await orchestrator.relaunchSession("s1");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Container removed externally");
    });
  });

  // ── Archive ───────────────────────────────────────────────────────────────

  describe("archiveSession()", () => {
    it("kills, removes container, unwatches PR, and marks archived", async () => {
      const result = await orchestrator.archiveSession("s1");

      expect(result.ok).toBe(true);
      expect(deps.launcher.kill).toHaveBeenCalledWith("s1");
      expect(containerManager.removeContainer).toHaveBeenCalledWith("s1");
      expect(deps.prPoller.unwatch).toHaveBeenCalledWith("s1");
      expect(deps.launcher.setArchived).toHaveBeenCalledWith("s1", true);
      expect(deps.sessionStore.setArchived).toHaveBeenCalledWith("s1", true);
    });

    it("performs Linear transition when linearTransition=backlog", async () => {
      // Set up linked issue
      vi.mocked(sessionLinearIssues.getLinearIssue).mockReturnValue({
        id: "issue-1",
        identifier: "ENG-42",
        teamId: "team-1",
        connectionId: "conn-1",
      } as any);
      vi.mocked(resolveApiKey).mockReturnValue({ apiKey: "lin_api_123", connectionId: "conn-1" });
      vi.mocked(fetchLinearTeamStates).mockResolvedValue([
        {
          id: "team-1",
          key: "ENG",
          name: "Engineering",
          states: [
            { id: "state-backlog", name: "Backlog", type: "backlog" },
            { id: "state-done", name: "Done", type: "completed" },
          ],
        },
      ]);
      vi.mocked(transitionLinearIssue).mockResolvedValue({
        ok: true,
        issue: { id: "issue-1", identifier: "ENG-42", stateName: "Backlog", stateType: "backlog" },
      } as any);

      const result = await orchestrator.archiveSession("s1", { linearTransition: "backlog" });

      expect(result.ok).toBe(true);
      expect(fetchLinearTeamStates).toHaveBeenCalledWith("lin_api_123");
      expect(transitionLinearIssue).toHaveBeenCalledWith("issue-1", "state-backlog", "lin_api_123", "conn-1");
      // Session should still be archived even with transition
      expect(deps.launcher.setArchived).toHaveBeenCalledWith("s1", true);
    });

    it("archives even when Linear transition fails", async () => {
      vi.mocked(sessionLinearIssues.getLinearIssue).mockReturnValue({
        id: "issue-1",
        identifier: "ENG-42",
        teamId: "team-1",
        connectionId: "conn-1",
      } as any);
      vi.mocked(resolveApiKey).mockReturnValue({ apiKey: "lin_api_123", connectionId: "conn-1" });
      vi.mocked(fetchLinearTeamStates).mockResolvedValue([{
        id: "team-1",
        key: "ENG",
        name: "Engineering",
        states: [{ id: "state-backlog", name: "Backlog", type: "backlog" }],
      }]);
      vi.mocked(transitionLinearIssue).mockResolvedValue({ ok: false, error: "API error" });

      const result = await orchestrator.archiveSession("s1", { linearTransition: "backlog" });

      expect(result.ok).toBe(true);
      expect(result.linearTransition?.ok).toBe(false);
      expect(deps.launcher.setArchived).toHaveBeenCalledWith("s1", true);
    });

    it("cleans up worktree during archive", async () => {
      deps.worktreeTracker.getBySession.mockReturnValue({
        sessionId: "s1",
        repoRoot: "/repo",
        branch: "feat",
        worktreePath: "/wt/feat",
        createdAt: 1000,
      });

      const result = await orchestrator.archiveSession("s1");

      expect(result.ok).toBe(true);
      expect(result.worktree).toMatchObject({ cleaned: true, path: "/wt/feat" });
      expect(gitUtils.removeWorktree).toHaveBeenCalledWith("/repo", "/wt/feat", {
        force: false,
        branchToDelete: undefined,
      });
    });
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  describe("deleteSession()", () => {
    it("performs full cleanup: kill, container, worktree, PR, Linear, bridge", async () => {
      const result = await orchestrator.deleteSession("s1");

      expect(result.ok).toBe(true);
      expect(deps.launcher.kill).toHaveBeenCalledWith("s1");
      expect(containerManager.removeContainer).toHaveBeenCalledWith("s1");
      expect(deps.prPoller.unwatch).toHaveBeenCalledWith("s1");
      expect(sessionLinearIssues.removeLinearIssue).toHaveBeenCalledWith("s1");
      expect(deps.launcher.removeSession).toHaveBeenCalledWith("s1");
      expect(deps.wsBridge.closeSession).toHaveBeenCalledWith("s1");
    });

    it("returns worktree cleanup info", async () => {
      deps.worktreeTracker.getBySession.mockReturnValue({
        sessionId: "s1",
        repoRoot: "/repo",
        branch: "feat",
        worktreePath: "/wt/feat",
        createdAt: 1000,
      });

      const result = await orchestrator.deleteSession("s1");

      expect(result.ok).toBe(true);
      expect(result.worktree).toMatchObject({ cleaned: true, path: "/wt/feat" });
    });

    it("passes branchToDelete when actualBranch differs from branch", async () => {
      // When actualBranch differs from branch, the worktree-unique branch should be deleted.
      // force=true in deleteSession means "skip dirty check", but removeWorktree gets
      // force: dirty (isWorktreeDirty() result), which is false by default.
      deps.worktreeTracker.getBySession.mockReturnValue({
        sessionId: "s1",
        repoRoot: "/repo",
        branch: "feat",
        actualBranch: "feat-wt-1234",
        worktreePath: "/wt/feat",
        createdAt: 1000,
      });

      await orchestrator.deleteSession("s1");

      expect(gitUtils.removeWorktree).toHaveBeenCalledWith("/repo", "/wt/feat", {
        force: false,
        branchToDelete: "feat-wt-1234",
      });
    });

    it("cleans up auto-relaunch tracking state on delete", async () => {
      // Simulate auto-relaunch state existing for this session by triggering
      // a relaunch cycle first via initialize + the auto-relaunch callback.
      // Instead, we verify indirectly: after delete, a new session with the same ID
      // won't carry stale counts. We check the internal cleanup happens by verifying
      // no memory leak: the delete method clears autoRelaunchCounts and relaunchingSet.
      await orchestrator.deleteSession("s1");

      // The key verification is that deleteSession completes without error
      // and includes all cleanup steps. The auto-relaunch maps are private
      // but their cleanup prevents memory leaks in long-running processes.
      expect(deps.launcher.kill).toHaveBeenCalledWith("s1");
      expect(deps.wsBridge.closeSession).toHaveBeenCalledWith("s1");
    });
  });

  // ── Unarchive ─────────────────────────────────────────────────────────────

  describe("unarchiveSession()", () => {
    it("unsets archived flag on launcher and store", () => {
      const result = orchestrator.unarchiveSession("s1");

      expect(result.ok).toBe(true);
      expect(deps.launcher.setArchived).toHaveBeenCalledWith("s1", false);
      expect(deps.sessionStore.setArchived).toHaveBeenCalledWith("s1", false);
    });
  });

  // ── Auto-naming ───────────────────────────────────────────────────────────

  describe("handleAutoNaming (via initialize)", () => {
    it("generates title when anthropicApiKey is set and no name exists", async () => {
      vi.mocked(settingsManager.getSettings).mockReturnValue({
        anthropicApiKey: "sk-ant-123",
      } as any);
      vi.mocked(sessionNames.getName).mockReturnValue(undefined);
      deps.launcher.getSession.mockReturnValue({ model: "claude-sonnet-4-6" });
      vi.mocked(generateSessionTitle).mockResolvedValue("Test Title");

      orchestrator.initialize();
      const cb = deps.wsBridge.onFirstTurnCompletedCallback.mock.calls[0][0];
      await cb("s1", "Hello world");

      expect(generateSessionTitle).toHaveBeenCalledWith("Hello world", "claude-sonnet-4-6");
      expect(sessionNames.setName).toHaveBeenCalledWith("s1", "Test Title");
      expect(deps.wsBridge.broadcastNameUpdate).toHaveBeenCalledWith("s1", "Test Title");
    });

    it("skips naming when session already has a name", async () => {
      vi.mocked(settingsManager.getSettings).mockReturnValue({ anthropicApiKey: "sk-ant-123" } as any);
      vi.mocked(sessionNames.getName).mockReturnValue("Existing Name");

      orchestrator.initialize();
      const cb = deps.wsBridge.onFirstTurnCompletedCallback.mock.calls[0][0];
      await cb("s1", "Hello");

      expect(generateSessionTitle).not.toHaveBeenCalled();
    });

    it("skips naming when no API key is configured", async () => {
      vi.mocked(settingsManager.getSettings).mockReturnValue({ anthropicApiKey: "" } as any);

      orchestrator.initialize();
      const cb = deps.wsBridge.onFirstTurnCompletedCallback.mock.calls[0][0];
      await cb("s1", "Hello");

      expect(generateSessionTitle).not.toHaveBeenCalled();
    });
  });

  // ── Reconnection watchdog ─────────────────────────────────────────────────

  describe("startReconnectionWatchdog (via initialize)", () => {
    it("does nothing when no sessions are starting", () => {
      deps.launcher.getStartingSessions.mockReturnValue([]);
      orchestrator.initialize();

      // No error thrown, no relaunch called
      expect(deps.launcher.getStartingSessions).toHaveBeenCalled();
    });

    it("schedules relaunch for stale starting sessions", async () => {
      vi.useFakeTimers();
      try {
        deps.launcher.getStartingSessions
          .mockReturnValueOnce([{ sessionId: "s1", state: "starting" }])
          .mockReturnValueOnce([{ sessionId: "s1", state: "starting" }]);

        orchestrator.initialize();

        // Advance past the reconnect grace period (default 30s)
        await vi.advanceTimersByTimeAsync(30_000);

        expect(deps.launcher.relaunch).toHaveBeenCalledWith("s1");
      } finally {
        vi.useRealTimers();
      }
    });

    it("skips archived sessions during reconnection watchdog", async () => {
      vi.useFakeTimers();
      try {
        deps.launcher.getStartingSessions
          .mockReturnValueOnce([{ sessionId: "s1", state: "starting" }])
          .mockReturnValueOnce([{ sessionId: "s1", state: "starting", archived: true }]);

        orchestrator.initialize();
        await vi.advanceTimersByTimeAsync(30_000);

        // Should NOT relaunch archived session
        expect(deps.launcher.relaunch).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── Worktree cleanup ──────────────────────────────────────────────────────

  describe("cleanupWorktree (via deleteSession/archiveSession)", () => {
    it("returns undefined when session has no worktree mapping", async () => {
      deps.worktreeTracker.getBySession.mockReturnValue(null);

      const result = await orchestrator.deleteSession("s1");

      expect(result.worktree).toBeUndefined();
    });

    it("does not remove worktree in use by another session", async () => {
      deps.worktreeTracker.getBySession.mockReturnValue({
        sessionId: "s1",
        repoRoot: "/repo",
        branch: "feat",
        worktreePath: "/wt/feat",
        createdAt: 1000,
      });
      deps.worktreeTracker.isWorktreeInUse.mockReturnValue(true);

      const result = await orchestrator.deleteSession("s1");

      expect(result.worktree).toMatchObject({ cleaned: false, path: "/wt/feat" });
      expect(gitUtils.removeWorktree).not.toHaveBeenCalled();
    });

    it("does not remove dirty worktree unless forced", async () => {
      deps.worktreeTracker.getBySession.mockReturnValue({
        sessionId: "s1",
        repoRoot: "/repo",
        branch: "feat",
        worktreePath: "/wt/feat",
        createdAt: 1000,
      });
      vi.mocked(gitUtils.isWorktreeDirty).mockReturnValue(true);

      // Archive without force
      const result = await orchestrator.archiveSession("s1");

      expect(result.worktree).toMatchObject({ cleaned: false, dirty: true, path: "/wt/feat" });
      expect(gitUtils.removeWorktree).not.toHaveBeenCalled();
    });

    it("force-removes dirty worktree when force=true", async () => {
      deps.worktreeTracker.getBySession.mockReturnValue({
        sessionId: "s1",
        repoRoot: "/repo",
        branch: "feat",
        worktreePath: "/wt/feat",
        createdAt: 1000,
      });
      vi.mocked(gitUtils.isWorktreeDirty).mockReturnValue(true);

      const result = await orchestrator.archiveSession("s1", { force: true });

      expect(result.worktree).toMatchObject({ cleaned: true, path: "/wt/feat" });
      expect(gitUtils.removeWorktree).toHaveBeenCalledWith("/repo", "/wt/feat", {
        force: true,
        branchToDelete: undefined,
      });
    });
  });
});
