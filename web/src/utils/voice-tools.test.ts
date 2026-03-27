// @vitest-environment jsdom
/**
 * Tests for the voice tool executor.
 *
 * Tools now dispatch visual actions (VoiceAction) to the store instead of
 * calling APIs directly. The tests verify that each tool dispatches the
 * correct action type and that read-only tools still work directly.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useStore } from "../store.js";

// Mock external dependencies
vi.mock("../api.js", () => ({
  api: {
    listSessions: vi.fn().mockResolvedValue([
      { sessionId: "s1", state: "connected", backendType: "claude", cwd: "/home/user/project", archived: false, name: "Test Session" },
      { sessionId: "s2", state: "running", backendType: "codex", cwd: "/home/user/other", archived: true, name: "Archived" },
    ]),
    getGeminiKey: vi.fn().mockResolvedValue({ key: "test-key" }),
  },
  createSessionStream: vi.fn().mockResolvedValue({
    sessionId: "new-session",
    state: "starting",
    cwd: "/home/user/project",
    backendType: "claude",
  }),
}));

vi.mock("../ws.js", () => ({
  sendToSession: vi.fn(),
  createClientMessageId: vi.fn(() => "test-msg-id"),
  connectSession: vi.fn(),
  waitForConnection: vi.fn().mockResolvedValue(undefined),
}));

describe("voice-tools", () => {
  beforeEach(() => {
    useStore.getState().reset();
    vi.clearAllMocks();
    window.location.hash = "#/";
  });

  // ── navigate_page ──────────────────────────────────────────────────────

  it("navigate_page dispatches navigate action", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");

    // Start tool execution — it dispatches and waits for completion
    const promise = executeVoiceTool("navigate_page", { page: "settings" });

    // Check the pending action
    const action = useStore.getState().voicePendingAction;
    expect(action).toEqual({ type: "navigate", page: "settings" });

    // Simulate component completing the action
    useStore.getState().completeVoiceAction({ success: true, navigated_to: "settings" });

    const result = await promise;
    expect(result).toEqual({ success: true, navigated_to: "settings" });
  });

  // ── list_sessions (read-only, no dispatch) ─────────────────────────────

  it("list_sessions returns formatted session list directly", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");
    const result = (await executeVoiceTool("list_sessions", {})) as {
      sessions: Array<{ id: string; name: string; status: string; backend: string }>;
      count: number;
    };
    expect(result.count).toBe(1);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe("s1");
  });

  // ── switch_session ─────────────────────────────────────────────────────

  it("switch_session dispatches switch_session action by name", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");
    useStore.getState().setSessionName("session-123", "My Project");
    useStore.getState().setSdkSessions([
      { sessionId: "session-123", state: "connected", cwd: "/home/user/project", createdAt: Date.now() },
    ]);

    const promise = executeVoiceTool("switch_session", { session_name_or_id: "My Project" });

    const action = useStore.getState().voicePendingAction;
    expect(action).toEqual({ type: "switch_session", sessionId: "session-123" });

    useStore.getState().completeVoiceAction({ success: true });
    await promise;
  });

  it("switch_session returns error for unknown session", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");
    const result = await executeVoiceTool("switch_session", { session_name_or_id: "nonexistent" });
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("not found") }));
  });

  // ── approve_permission ─────────────────────────────────────────────────

  it("approve_permission dispatches click_allow action", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");

    const promise = executeVoiceTool("approve_permission", {
      session_id: "s1",
      request_id: "req-1",
    });

    const action = useStore.getState().voicePendingAction;
    expect(action).toEqual({ type: "click_allow", sessionId: "s1", requestId: "req-1" });

    useStore.getState().completeVoiceAction({ success: true });
    const result = await promise;
    expect(result).toEqual({ success: true });
  });

  // ── deny_permission ────────────────────────────────────────────────────

  it("deny_permission dispatches click_deny action", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");

    const promise = executeVoiceTool("deny_permission", {
      session_id: "s1",
      request_id: "req-1",
    });

    const action = useStore.getState().voicePendingAction;
    expect(action).toEqual({ type: "click_deny", sessionId: "s1", requestId: "req-1" });

    useStore.getState().completeVoiceAction({ success: true });
    await promise;
  });

  // ── approve_all_permissions ────────────────────────────────────────────

  it("approve_all_permissions dispatches click_allow_all action", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");

    const promise = executeVoiceTool("approve_all_permissions", { session_id: "s1" });

    const action = useStore.getState().voicePendingAction;
    expect(action).toEqual({ type: "click_allow_all", sessionId: "s1" });

    useStore.getState().completeVoiceAction({ success: true });
    await promise;
  });

  // ── interrupt_session ──────────────────────────────────────────────────

  it("interrupt_session dispatches click_interrupt action", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");

    const promise = executeVoiceTool("interrupt_session", { session_id: "s1" });

    const action = useStore.getState().voicePendingAction;
    expect(action).toEqual({ type: "click_interrupt", sessionId: "s1" });

    useStore.getState().completeVoiceAction({ success: true });
    await promise;
  });

  // ── send_message ───────────────────────────────────────────────────────

  it("send_message dispatches type_and_send to composer", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");

    const promise = executeVoiceTool("send_message", {
      session_id: "s1",
      content: "Fix the bug",
    });

    // Wait for navigation delay
    await new Promise((r) => setTimeout(r, 350));

    const action = useStore.getState().voicePendingAction;
    expect(action).toEqual({ type: "type_and_send", target: "composer", text: "Fix the bug", sessionId: "s1" });

    useStore.getState().completeVoiceAction({ success: true });
    await promise;
  });

  it("send_message returns error when session_id missing", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");
    const result = await executeVoiceTool("send_message", { content: "Hello" });
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("required") }));
  });

  // ── create_session ─────────────────────────────────────────────────────

  it("create_session dispatches type_and_send to home", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");

    const promise = executeVoiceTool("create_session", { prompt: "Build a feature" });

    // Wait for navigation delay
    await new Promise((r) => setTimeout(r, 350));

    const action = useStore.getState().voicePendingAction;
    expect(action).toEqual({ type: "type_and_send", target: "home", text: "Build a feature" });

    useStore.getState().completeVoiceAction({ success: true });
    await promise;

    // Should have navigated to home
    expect(window.location.hash).toBe("#/");
  });

  it("create_session returns error with empty prompt", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");
    const result = await executeVoiceTool("create_session", { prompt: "" });
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("required") }));
  });

  // ── get_session_status (read-only) ─────────────────────────────────────

  it("get_session_status returns session info directly", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");
    const store = useStore.getState();
    store.addSession({
      session_id: "test-session",
      model: "claude-sonnet-4-6",
      cwd: "/home/user/project",
      permissionMode: "acceptEdits",
      total_cost_usd: 0.05,
      num_turns: 3,
      context_used_percent: 42,
      git_branch: "main",
      tools: [], claude_code_version: "1.0", mcp_servers: [],
      agents: [], slash_commands: [], skills: [],
      is_compacting: false, is_worktree: false, is_containerized: false,
      repo_root: "/home/user/project",
      git_ahead: 0, git_behind: 0, total_lines_added: 10, total_lines_removed: 5,
    });
    store.setSessionName("test-session", "My Session");
    store.setSessionStatus("test-session", "running");

    const result = await executeVoiceTool("get_session_status", { session_id: "test-session" }) as Record<string, unknown>;
    expect(result.name).toBe("My Session");
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.status).toBe("running");
  });

  // ── unknown tool ───────────────────────────────────────────────────────

  it("returns error for unknown tool name", async () => {
    const { executeVoiceTool } = await import("./voice-tools.js");
    const result = await executeVoiceTool("nonexistent_tool", {});
    expect(result).toEqual({ error: "Unknown tool: nonexistent_tool" });
  });

  // ── TOOL_DECLARATIONS ──────────────────────────────────────────────────

  it("TOOL_DECLARATIONS has 10 function declarations", async () => {
    const { TOOL_DECLARATIONS } = await import("./voice-tools.js");
    expect(TOOL_DECLARATIONS).toHaveLength(10);
  });

  it("all tool declarations have name, description, and parameters", async () => {
    const { TOOL_DECLARATIONS } = await import("./voice-tools.js");
    for (const decl of TOOL_DECLARATIONS) {
      expect(decl).toHaveProperty("name");
      expect(decl).toHaveProperty("description");
      expect(decl).toHaveProperty("parameters");
      expect(typeof decl.name).toBe("string");
      expect(typeof decl.description).toBe("string");
      expect(decl.parameters?.type).toBeDefined();
    }
  });
});
