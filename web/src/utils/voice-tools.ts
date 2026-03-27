/**
 * Voice tool declarations and executor for Gemini Voice Control.
 *
 * Tools dispatch visual actions to the UI (typing animations, button clicks)
 * instead of calling APIs directly. This makes the interaction visible to
 * the user — they see Gemini "typing" into the Composer, "clicking" Allow, etc.
 *
 * Read-only tools (list_sessions, get_session_status) still read from the store
 * directly since they don't modify anything.
 */

import { Type, type FunctionDeclaration } from "@google/genai";
import { api } from "../api.js";
import { useStore } from "../store.js";
import { navigateToSession } from "./routing.js";
import type { VoiceAction } from "../store/voice-slice.js";

// ─── System Instruction ──────────────────────────────────────────────────────

export const VOICE_SYSTEM_INSTRUCTION = `You are a voice assistant for "The Companion", a web UI for AI coding agents (Claude Code and Codex).
You help users control The Companion hands-free by voice. You can:

- Create coding sessions: specify a prompt, project folder (cwd), backend (claude or codex), model, and sandbox mode
- Send messages to active sessions
- Approve or deny tool permission requests (describe what's being approved first)
- Navigate the UI to different pages (home, settings, sandboxes, environments, prompts, integrations, agents, runs, scheduled, terminal)
- Switch between active sessions by name or ID
- List active sessions and their status
- Interrupt/stop running sessions
- Get detailed session status

Rules:
- Keep responses brief — you're speaking them aloud
- When creating sessions, use "claude" backend and the user's home directory if they don't specify
- When approving permissions, briefly describe what the tool wants to do
- Be conversational and confirm completed actions
- If you need more info to execute a command, ask briefly
- When listing sessions, mention their name, status, and project
- Respond in the same language as the user. If the user speaks French, respond in French. If they speak English, respond in English.`;

// ─── Tool Declarations (Gemini function declaration format) ──────────────────

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "create_session",
    description: "Create a new AI coding session and send an initial prompt. The prompt will be visually typed into the home page input.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING, description: "Initial prompt/task to send to the AI" },
        cwd: { type: Type.STRING, description: "Project directory path (working directory)" },
        backend: { type: Type.STRING, description: "AI backend: 'claude' or 'codex'", enum: ["claude", "codex"] },
        model: { type: Type.STRING, description: "Model name (e.g. 'claude-sonnet-4-6', 'o4-mini')" },
        sandbox_enabled: { type: Type.BOOLEAN, description: "Run in a Docker sandbox" },
        permission_mode: { type: Type.STRING, description: "Permission mode: 'default', 'acceptEdits', 'bypassPermissions', 'plan'" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "send_message",
    description: "Send a text message to an active session. The message will be visually typed into the chat composer.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        session_id: { type: Type.STRING, description: "Session ID to send the message to. Use list_sessions to find available sessions." },
        content: { type: Type.STRING, description: "Message content to send" },
      },
      required: ["session_id", "content"],
    },
  },
  {
    name: "approve_permission",
    description: "Approve a pending tool permission request. The Allow button will be visually clicked.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        session_id: { type: Type.STRING, description: "Session ID" },
        request_id: { type: Type.STRING, description: "Permission request ID to approve" },
      },
      required: ["session_id", "request_id"],
    },
  },
  {
    name: "deny_permission",
    description: "Deny a pending tool permission request. The Deny button will be visually clicked.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        session_id: { type: Type.STRING, description: "Session ID" },
        request_id: { type: Type.STRING, description: "Permission request ID to deny" },
      },
      required: ["session_id", "request_id"],
    },
  },
  {
    name: "approve_all_permissions",
    description: "Approve all pending permission requests for a session at once. Each Allow button will be visually clicked.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        session_id: { type: Type.STRING, description: "Session ID" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "navigate_page",
    description: "Navigate the Companion UI to a specific page.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        page: {
          type: Type.STRING,
          description: "Page to navigate to",
          enum: ["home", "settings", "sandboxes", "environments", "prompts", "integrations", "agents", "runs", "scheduled", "terminal"],
        },
      },
      required: ["page"],
    },
  },
  {
    name: "switch_session",
    description: "Switch to viewing a specific session by name or ID.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        session_name_or_id: { type: Type.STRING, description: "Session name or session ID to switch to" },
      },
      required: ["session_name_or_id"],
    },
  },
  {
    name: "list_sessions",
    description: "List all active (non-archived) sessions with their name, status, backend, and project folder",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "interrupt_session",
    description: "Stop/interrupt the current AI generation in a session. The stop button will be visually clicked.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        session_id: { type: Type.STRING, description: "Session ID to interrupt" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "get_session_status",
    description: "Get detailed status of a session including model, cost, turns, and pending permissions",
    parameters: {
      type: Type.OBJECT,
      properties: {
        session_id: { type: Type.STRING, description: "Session ID" },
      },
      required: ["session_id"],
    },
  },
];

// ─── Visual Action Dispatcher ────────────────────────────────────────────────

const ACTION_TIMEOUT_MS = 30_000;

/**
 * Dispatch a visual action to the UI and wait for it to complete.
 * The component that handles the action calls `completeVoiceAction(result)`.
 */
function dispatchVoiceAction(action: VoiceAction): Promise<unknown> {
  return new Promise((resolve) => {
    const store = useStore.getState();
    store.dispatchVoiceAction(action, resolve);

    // Safety timeout — don't block Gemini forever if a component doesn't handle the action
    setTimeout(() => {
      if (useStore.getState().voicePendingAction === action) {
        useStore.getState().completeVoiceAction({ error: "Action timed out" });
      }
    }, ACTION_TIMEOUT_MS);
  });
}

// ─── Tool Executor ───────────────────────────────────────────────────────────

/**
 * Execute a voice tool call from Gemini.
 * Visual tools dispatch actions to UI components.
 * Read-only tools query the store directly.
 */
export async function executeVoiceTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "create_session":
      return executeCreateSession(args);
    case "send_message":
      return executeSendMessage(args);
    case "approve_permission":
      return dispatchVoiceAction({ type: "click_allow", sessionId: args.session_id as string, requestId: args.request_id as string });
    case "deny_permission":
      return dispatchVoiceAction({ type: "click_deny", sessionId: args.session_id as string, requestId: args.request_id as string });
    case "approve_all_permissions":
      return dispatchVoiceAction({ type: "click_allow_all", sessionId: args.session_id as string });
    case "navigate_page":
      return dispatchVoiceAction({ type: "navigate", page: args.page as string });
    case "switch_session":
      return executeSwitchSession(args);
    case "list_sessions":
      return executeListSessions();
    case "interrupt_session":
      return dispatchVoiceAction({ type: "click_interrupt", sessionId: args.session_id as string });
    case "get_session_status":
      return executeGetSessionStatus(args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Tool Implementations ────────────────────────────────────────────────────

async function executeCreateSession(args: Record<string, unknown>): Promise<unknown> {
  const prompt = (args.prompt as string) || "";
  if (!prompt.trim()) return { error: "prompt is required" };

  // Navigate to home first so the typing animation is visible
  window.location.hash = "#/";
  // Small delay to let the home page render
  await new Promise((r) => setTimeout(r, 300));

  // Dispatch typing animation to HomePage
  return dispatchVoiceAction({ type: "type_and_send", target: "home", text: prompt });
}

async function executeSendMessage(args: Record<string, unknown>): Promise<unknown> {
  const sessionId = args.session_id as string;
  const content = args.content as string;
  if (!sessionId || !content) return { error: "session_id and content are required" };

  // Navigate to the session first so the Composer is visible
  navigateToSession(sessionId);
  await new Promise((r) => setTimeout(r, 300));

  // Dispatch typing animation to Composer
  return dispatchVoiceAction({ type: "type_and_send", target: "composer", text: content, sessionId });
}

function executeSwitchSession(args: Record<string, unknown>): unknown {
  const nameOrId = (args.session_name_or_id as string) || "";
  if (!nameOrId) return { error: "session_name_or_id is required" };

  const store = useStore.getState();
  let sessionId = nameOrId;

  // Try to find by name (case-insensitive partial match)
  const lowerQuery = nameOrId.toLowerCase();
  for (const [id, name] of store.sessionNames) {
    if (name.toLowerCase().includes(lowerQuery)) {
      sessionId = id;
      break;
    }
  }

  // Verify it exists
  const exists = store.sdkSessions.some((s) => s.sessionId === sessionId && !s.archived);
  if (!exists) return { error: `Session not found: ${nameOrId}` };

  // Dispatch visual switch
  return dispatchVoiceAction({ type: "switch_session", sessionId });
}

async function executeListSessions(): Promise<unknown> {
  try {
    const sessions = await api.listSessions();
    const store = useStore.getState();
    const activeSessions = sessions
      .filter((s) => !s.archived)
      .map((s) => ({
        id: s.sessionId,
        name: store.sessionNames.get(s.sessionId) || s.name || s.sessionId,
        status: s.state,
        backend: s.backendType || "claude",
        project: s.cwd?.split("/").pop() || s.cwd,
        cwd: s.cwd,
        model: s.model,
      }));
    return { sessions: activeSessions, count: activeSessions.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function executeGetSessionStatus(args: Record<string, unknown>): unknown {
  const sessionId = args.session_id as string;
  if (!sessionId) return { error: "session_id is required" };

  const store = useStore.getState();
  const session = store.sessions.get(sessionId);
  const perms = store.pendingPermissions.get(sessionId);
  const status = store.sessionStatus.get(sessionId);
  const name = store.sessionNames.get(sessionId);

  if (!session) return { error: `Session not found: ${sessionId}` };

  return {
    session_id: sessionId,
    name: name || sessionId,
    model: session.model,
    cwd: session.cwd,
    status: status || "unknown",
    cost_usd: session.total_cost_usd,
    num_turns: session.num_turns,
    context_used_percent: session.context_used_percent,
    git_branch: session.git_branch,
    permission_mode: session.permissionMode,
    pending_permissions: perms
      ? Array.from(perms.values()).map((p) => ({
        request_id: p.request_id,
        tool: p.tool_name,
        description: p.description || `${p.tool_name} wants to execute`,
      }))
      : [],
  };
}
