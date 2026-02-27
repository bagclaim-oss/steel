// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SessionState } from "../../server/session-types.js";

// Polyfill scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn();

const mockSendToSession = vi.fn();
const mockListPrompts = vi.fn();
const mockCreatePrompt = vi.fn();

// Build a controllable mock store state
let mockStoreState: Record<string, unknown> = {};

vi.mock("../ws.js", () => ({
  sendToSession: (...args: unknown[]) => mockSendToSession(...args),
}));

vi.mock("../api.js", () => ({
  api: {
    gitPull: vi.fn().mockResolvedValue({ success: true, output: "", git_ahead: 0, git_behind: 0 }),
    listPrompts: (...args: unknown[]) => mockListPrompts(...args),
    createPrompt: (...args: unknown[]) => mockCreatePrompt(...args),
    getSettings: vi.fn().mockResolvedValue({ deepgramApiKeyConfigured: false }),
  },
}));

// Mock useStore as a function that takes a selector
const mockAppendMessage = vi.fn();
const mockUpdateSession = vi.fn();
const mockSetPreviousPermissionMode = vi.fn();

vi.mock("../store.js", () => {
  // Create a mock store function that acts like zustand's useStore
  const useStore = (selector: (state: Record<string, unknown>) => unknown) => {
    return selector(mockStoreState);
  };
  // Add getState for imperative access (used by Composer for appendMessage)
  useStore.getState = () => mockStoreState;
  return { useStore };
});

import { Composer } from "./Composer.js";

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    session_id: "s1",
    model: "claude-sonnet-4-6",
    cwd: "/test",
    tools: [],
    permissionMode: "acceptEdits",
    claude_code_version: "1.0",
    mcp_servers: [],
    agents: [],
    slash_commands: [],
    skills: [],
    total_cost_usd: 0,
    num_turns: 0,
    context_used_percent: 0,
    is_compacting: false,
    git_branch: "",
    is_worktree: false,
    is_containerized: false,
    repo_root: "",
    git_ahead: 0,
    git_behind: 0,
    total_lines_added: 0,
    total_lines_removed: 0,
    ...overrides,
  };
}

function setupMockStore(overrides: {
  isConnected?: boolean;
  sessionStatus?: "idle" | "running" | "compacting" | null;
  session?: Partial<SessionState>;
} = {}) {
  const {
    isConnected = true,
    sessionStatus = "idle",
    session = {},
  } = overrides;

  const sessionsMap = new Map<string, SessionState>();
  sessionsMap.set("s1", makeSession(session));

  const cliConnectedMap = new Map<string, boolean>();
  cliConnectedMap.set("s1", isConnected);

  const sessionStatusMap = new Map<string, "idle" | "running" | "compacting" | null>();
  sessionStatusMap.set("s1", sessionStatus);

  const previousPermissionModeMap = new Map<string, string>();
  previousPermissionModeMap.set("s1", "acceptEdits");

  mockStoreState = {
    sessions: sessionsMap,
    cliConnected: cliConnectedMap,
    sessionStatus: sessionStatusMap,
    previousPermissionMode: previousPermissionModeMap,
    sdkSessions: [{ sessionId: "s1", model: "claude-sonnet-4-6", backendType: "claude", cwd: "/test" }],
    sessionNames: new Map<string, string>(),
    appendMessage: mockAppendMessage,
    updateSession: mockUpdateSession,
    setPreviousPermissionMode: mockSetPreviousPermissionMode,
    setSdkSessions: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListPrompts.mockResolvedValue([]);
  mockCreatePrompt.mockResolvedValue({
    id: "p-new",
    name: "New Prompt",
    content: "Text",
    scope: "project",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  setupMockStore();
});

// ─── Basic rendering ────────────────────────────────────────────────────────

describe("Composer basic rendering", () => {
  it("renders textarea and send button", () => {
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea");
    expect(textarea).toBeTruthy();
    // Send button (the round one with the arrow SVG) - identified by title
    const sendBtn = screen.getAllByTitle("Send message")[0];
    expect(sendBtn).toBeTruthy();
  });
});

// ─── Send button disabled state ──────────────────────────────────────────────

describe("Composer send button state", () => {
  it("send button is disabled when text is empty", () => {
    render(<Composer sessionId="s1" />);
    const sendBtn = screen.getAllByTitle("Send message")[0];
    expect(sendBtn.hasAttribute("disabled")).toBe(true);
  });

  it("send button is disabled when CLI is not connected", () => {
    setupMockStore({ isConnected: false });
    render(<Composer sessionId="s1" />);
    const sendBtn = screen.getAllByTitle("Send message")[0];
    expect(sendBtn.hasAttribute("disabled")).toBe(true);
  });

  it("typing text enables the send button", async () => {
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "Hello world" } });

    const sendBtn = screen.getAllByTitle("Send message")[0];
    expect(sendBtn.hasAttribute("disabled")).toBe(false);
  });
});

// ─── Sending messages ────────────────────────────────────────────────────────

describe("Composer sending messages", () => {
  it("pressing Enter sends the message via sendToSession", () => {
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "test message" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(mockSendToSession).toHaveBeenCalledWith("s1", expect.objectContaining({
      type: "user_message",
      content: "test message",
      session_id: "s1",
    }));
  });

  it("pressing Shift+Enter does NOT send the message", () => {
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "line 1" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(mockSendToSession).not.toHaveBeenCalled();
  });

  it("clicking the send button sends the message", () => {
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "click send" } });
    fireEvent.click(screen.getAllByTitle("Send message")[0]);

    expect(mockSendToSession).toHaveBeenCalledWith("s1", expect.objectContaining({
      type: "user_message",
      content: "click send",
    }));
  });

  it("textarea is cleared after sending", () => {
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "to be cleared" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(textarea.value).toBe("");
  });
});

// ─── Plan mode toggle ────────────────────────────────────────────────────────

describe("Composer plan mode toggle", () => {
  it("pressing Shift+Tab toggles plan mode", () => {
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.keyDown(textarea, { key: "Tab", shiftKey: true });

    // Should call sendToSession to set plan mode
    expect(mockSendToSession).toHaveBeenCalledWith("s1", {
      type: "set_permission_mode",
      mode: "plan",
    });
  });
});

// ─── Interrupt button ────────────────────────────────────────────────────────

describe("Composer interrupt button", () => {
  it("interrupt button appears when session is running", () => {
    setupMockStore({ sessionStatus: "running" });
    render(<Composer sessionId="s1" />);

    const stopBtn = screen.getAllByTitle("Stop generation")[0];
    expect(stopBtn).toBeTruthy();
    // Send button should not be present (both mobile and desktop show stop)
    expect(screen.queryAllByTitle("Send message")).toHaveLength(0);
  });

  it("interrupt button sends interrupt message", () => {
    setupMockStore({ sessionStatus: "running" });
    render(<Composer sessionId="s1" />);

    fireEvent.click(screen.getAllByTitle("Stop generation")[0]);

    expect(mockSendToSession).toHaveBeenCalledWith("s1", { type: "interrupt" });
  });

  it("send button appears when session is idle", () => {
    setupMockStore({ sessionStatus: "idle" });
    render(<Composer sessionId="s1" />);

    expect(screen.getAllByTitle("Send message")[0]).toBeTruthy();
    expect(screen.queryAllByTitle("Stop generation")).toHaveLength(0);
  });
});

// ─── Slash menu ──────────────────────────────────────────────────────────────

describe("Composer slash menu", () => {
  it("slash menu opens when typing /", () => {
    setupMockStore({
      session: {
        slash_commands: ["help", "clear"],
        skills: ["commit"],
      },
    });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "/" } });

    // Commands should appear in the menu
    expect(screen.getByText("/help")).toBeTruthy();
    expect(screen.getByText("/clear")).toBeTruthy();
    expect(screen.getByText("/commit")).toBeTruthy();
  });

  it("slash commands are filtered as user types", () => {
    setupMockStore({
      session: {
        slash_commands: ["help", "clear"],
        skills: ["commit"],
      },
    });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "/cl" } });

    expect(screen.getByText("/clear")).toBeTruthy();
    expect(screen.queryByText("/help")).toBeNull();
    // "commit" does not match "cl" so it should not appear either
    expect(screen.queryByText("/commit")).toBeNull();
  });

  it("slash menu does not open when there are no commands", () => {
    setupMockStore({
      session: {
        slash_commands: [],
        skills: [],
      },
    });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "/" } });

    // No command items should appear
    expect(screen.queryByText("/help")).toBeNull();
  });

  it("slash menu shows command types", () => {
    setupMockStore({
      session: {
        slash_commands: ["help"],
        skills: ["commit"],
      },
    });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "/" } });

    // Each command should display its type
    expect(screen.getByText("command")).toBeTruthy();
    expect(screen.getByText("skill")).toBeTruthy();
  });
});

// ─── Disabled state ──────────────────────────────────────────────────────────

describe("Composer disabled state", () => {
  it("textarea is disabled when CLI is not connected", () => {
    setupMockStore({ isConnected: false });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    expect(textarea.disabled).toBe(true);
  });

  it("textarea shows correct placeholder when connected", () => {
    setupMockStore({ isConnected: true });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    expect(textarea.placeholder).toContain("Type a message");
  });

  it("textarea shows waiting placeholder when not connected", () => {
    setupMockStore({ isConnected: false });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    expect(textarea.placeholder).toContain("Waiting for CLI connection");
  });
});

describe("Composer @ prompts menu", () => {
  it("opens @ menu and inserts selected prompt with Enter", async () => {
    // Validates keyboard insertion from @ suggestions without sending the message.
    mockListPrompts.mockResolvedValue([
      {
        id: "p1",
        name: "review-pr",
        content: "Review this PR and list risks.",
        scope: "global",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "@rev", selectionStart: 4 } });
    await screen.findByText("@review-pr");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect((textarea as HTMLTextAreaElement).value).toContain("Review this PR and list risks.");
    expect(mockSendToSession).not.toHaveBeenCalled();
  });

  it("filters prompts by typed query", async () => {
    // Validates fuzzy filtering by prompt name while typing after @.
    mockListPrompts.mockResolvedValue([
      {
        id: "p1",
        name: "review-pr",
        content: "Review this PR",
        scope: "global",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "p2",
        name: "write-tests",
        content: "Write tests",
        scope: "project",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "@wri", selectionStart: 4 } });
    await screen.findByText("@write-tests");

    expect(screen.getByText("@write-tests")).toBeTruthy();
    expect(screen.queryByText("@review-pr")).toBeNull();
  });

  it("does not refetch prompts on each @ query keystroke", async () => {
    // Validates prompt fetch remains stable while filtering happens client-side.
    mockListPrompts.mockResolvedValue([
      {
        id: "p1",
        name: "review-pr",
        content: "Review this PR",
        scope: "global",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    await waitFor(() => {
      expect(mockListPrompts).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(textarea, { target: { value: "@r", selectionStart: 2 } });
    await screen.findByText("@review-pr");
    fireEvent.change(textarea, { target: { value: "@re", selectionStart: 3 } });
    await screen.findByText("@review-pr");
    fireEvent.change(textarea, { target: { value: "@rev", selectionStart: 4 } });
    await screen.findByText("@review-pr");

    expect(mockListPrompts).toHaveBeenCalledTimes(1);
  });
});

// ─── Keyboard navigation ────────────────────────────────────────────────────

describe("Composer keyboard navigation", () => {
  it("Escape in the slash menu does not send a message", () => {
    // Verifies pressing Escape while the slash menu is open does not trigger
    // a message send — the key event should be consumed by the menu handler.
    setupMockStore({
      session: {
        slash_commands: ["help", "clear"],
        skills: [],
      },
    });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "/" } });
    expect(screen.getByText("/help")).toBeTruthy();

    fireEvent.keyDown(textarea, { key: "Escape" });

    // Escape should NOT send any message
    expect(mockSendToSession).not.toHaveBeenCalled();
    // The text should still be "/" (not cleared)
    expect((textarea as HTMLTextAreaElement).value).toBe("/");
  });

  it("ArrowDown/ArrowUp cycles through slash menu items", () => {
    // Verifies keyboard arrow navigation within the slash command menu.
    setupMockStore({
      session: {
        slash_commands: ["help", "clear"],
        skills: [],
      },
    });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "/" } });
    // First item should be highlighted by default (index 0)
    const items = screen.getAllByRole("button").filter(
      (btn) => btn.textContent?.startsWith("/"),
    );
    expect(items.length).toBeGreaterThanOrEqual(2);

    // Arrow down should move selection — pressing Enter selects the item
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    fireEvent.keyDown(textarea, { key: "Enter" });

    // The selected command should replace the textarea content
    expect((textarea as HTMLTextAreaElement).value).toContain("/clear");
  });

  it("Enter selects the highlighted slash command", () => {
    // Verifies that pressing Enter in the slash menu selects the command
    // without sending it as a message.
    setupMockStore({
      session: {
        slash_commands: ["help"],
        skills: [],
      },
    });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "/" } });
    expect(screen.getByText("/help")).toBeTruthy();

    fireEvent.keyDown(textarea, { key: "Enter" });
    // Should NOT send a WebSocket message — it should just fill the command
    expect(mockSendToSession).not.toHaveBeenCalled();
  });
});

// ─── Layout & overflow ──────────────────────────────────────────────────────

describe("Composer layout", () => {
  it("textarea has overflow-y-auto to handle long content", () => {
    // Verifies the textarea scrolls vertically rather than expanding infinitely.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;
    expect(textarea.className).toContain("overflow-y-auto");
  });

  it("send button has consistent dimensions", () => {
    // Verifies the send button has explicit sizing classes for consistent layout.
    // Both mobile (w-10 h-10) and desktop (w-9 h-9) send buttons exist in JSDOM.
    render(<Composer sessionId="s1" />);
    const sendBtns = screen.getAllByTitle("Send message");
    expect(sendBtns.length).toBeGreaterThanOrEqual(1);
    // At least one button should have explicit width/height classes
    const hasSize = sendBtns.some((btn) => btn.className.includes("w-"));
    expect(hasSize).toBe(true);
  });

  it("textarea is full-width within its container", () => {
    // Verifies the textarea stretches to fill the input area.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;
    expect(textarea.className).toContain("w-full");
  });
});

// ─── Microphone / push-to-talk ───────────────────────────────────────────────

describe("Composer microphone button", () => {
  it("mic button is hidden when Deepgram is not configured", async () => {
    // Default mock returns deepgramApiKeyConfigured: false
    render(<Composer sessionId="s1" />);
    await waitFor(() => {
      // The button should not be present at all
      expect(screen.queryByLabelText("Push-to-talk microphone")).toBeNull();
    });
  });

  it("mic button is shown when Deepgram is configured", async () => {
    // Override the mock to return deepgramConfigured: true
    const { api } = await import("../api.js");
    vi.mocked(api.getSettings).mockResolvedValueOnce({
      deepgramApiKeyConfigured: true,
      openrouterApiKeyConfigured: false,
      openrouterModel: "openrouter/free",
      linearApiKeyConfigured: false,
      linearAutoTransition: false,
      linearAutoTransitionStateName: "",
      editorTabEnabled: false,
      aiValidationEnabled: false,
      aiValidationAutoApprove: false,
      aiValidationAutoDeny: false,
    });

    render(<Composer sessionId="s1" />);

    // Wait for the mic button to appear (rendered for both mobile and desktop)
    const micButtons = await screen.findAllByLabelText("Push-to-talk microphone");
    expect(micButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("mic button has proper accessible label", async () => {
    const { api } = await import("../api.js");
    vi.mocked(api.getSettings).mockResolvedValueOnce({
      deepgramApiKeyConfigured: true,
      openrouterApiKeyConfigured: false,
      openrouterModel: "openrouter/free",
      linearApiKeyConfigured: false,
      linearAutoTransition: false,
      linearAutoTransitionStateName: "",
      editorTabEnabled: false,
      aiValidationEnabled: false,
      aiValidationAutoApprove: false,
      aiValidationAutoDeny: false,
    });

    render(<Composer sessionId="s1" />);

    const micButtons = await screen.findAllByLabelText("Push-to-talk microphone");
    // Both mobile and desktop buttons should have the label
    expect(micButtons.length).toBe(2);
    micButtons.forEach((btn) => {
      expect(btn.tagName).toBe("BUTTON");
    });
  });

  it("mic button is disabled when not connected", async () => {
    setupMockStore({ isConnected: false });
    const { api } = await import("../api.js");
    vi.mocked(api.getSettings).mockResolvedValueOnce({
      deepgramApiKeyConfigured: true,
      openrouterApiKeyConfigured: false,
      openrouterModel: "openrouter/free",
      linearApiKeyConfigured: false,
      linearAutoTransition: false,
      linearAutoTransitionStateName: "",
      editorTabEnabled: false,
      aiValidationEnabled: false,
      aiValidationAutoApprove: false,
      aiValidationAutoDeny: false,
    });

    render(<Composer sessionId="s1" />);

    const micButtons = await screen.findAllByLabelText("Push-to-talk microphone");
    micButtons.forEach((btn) => {
      expect(btn.hasAttribute("disabled")).toBe(true);
    });
  });
});

describe("Composer save prompt", () => {
  it("shows save error when create prompt fails", async () => {
    // Validates API failures are visible to the user instead of being silently ignored.
    mockCreatePrompt.mockRejectedValue(new Error("Could not save prompt right now"));
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "Prompt body text" } });
    // Mobile + desktop layouts render separate buttons; click the first visible one.
    fireEvent.click(screen.getAllByTitle("Save as prompt")[0]);
    const titleInput = screen.getByPlaceholderText("Prompt title");
    fireEvent.change(titleInput, { target: { value: "My Prompt" } });
    fireEvent.click(screen.getByText("Save"));

    expect(await screen.findByText("Could not save prompt right now")).toBeTruthy();
  });

  it("passes axe accessibility checks", async () => {
    const { axe } = await import("vitest-axe");
    setupMockStore({ isConnected: true });
    const { container } = render(<Composer sessionId="s1" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ─── Image paste and upload handling ─────────────────────────────────────────

vi.mock("../utils/image.js", () => ({
  readFileAsBase64: vi.fn().mockResolvedValue({ base64: "dGVzdA==", mediaType: "image/png" }),
}));

describe("Composer image handling", () => {
  it("displays image thumbnails when images are attached via file input", async () => {
    // Validates the image preview area renders thumbnails after file selection.
    const { container } = render(<Composer sessionId="s1" />);
    const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;

    // Simulate selecting an image file
    const file = new File(["fake-png-data"], "test.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    // Wait for the image thumbnail to appear
    const img = await waitFor(() => {
      const imgs = container.querySelectorAll("img[alt='test.png']");
      expect(imgs.length).toBeGreaterThanOrEqual(1);
      return imgs[0];
    });
    expect(img).toBeTruthy();
  });

  it("removes an image when the remove button is clicked", async () => {
    // Validates images can be removed from the attachment preview.
    const { container } = render(<Composer sessionId="s1" />);
    const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;

    const file = new File(["data"], "removable.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(container.querySelectorAll("img[alt='removable.png']").length).toBeGreaterThanOrEqual(1);
    });

    // Click the remove button (has aria-label "Remove image")
    const removeBtn = screen.getAllByLabelText("Remove image")[0];
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(container.querySelectorAll("img[alt='removable.png']").length).toBe(0);
    });
  });

  it("handles paste of images from clipboard", async () => {
    // Validates that pasting an image from clipboard attaches it.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    const file = new File(["clipboard-data"], "pasted.png", { type: "image/png" });
    const clipboardData = {
      items: [
        {
          type: "image/png",
          getAsFile: () => file,
        },
      ],
    };

    fireEvent.paste(textarea, { clipboardData });

    // Wait for the pasted image to appear in the preview
    await waitFor(() => {
      const imgs = container.querySelectorAll("img");
      expect(imgs.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("does not prevent default for non-image paste", () => {
    // Validates text-only paste is not intercepted by the image handler.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    const clipboardData = {
      items: [
        {
          type: "text/plain",
          getAsFile: () => null,
        },
      ],
    };

    // Should not throw, and should let default behavior through
    fireEvent.paste(textarea, { clipboardData });
    // No images should be added
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("sends images along with the message", async () => {
    // Validates that attached images are included in the user_message payload.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;
    const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;

    // Attach an image
    const file = new File(["img"], "send-me.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(container.querySelectorAll("img[alt='send-me.png']").length).toBeGreaterThanOrEqual(1);
    });

    // Type text and send
    fireEvent.change(textarea, { target: { value: "Check this image" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(mockSendToSession).toHaveBeenCalledWith("s1", expect.objectContaining({
      type: "user_message",
      content: "Check this image",
      images: [{ media_type: "image/png", data: "dGVzdA==" }],
    }));
  });

  it("clears images after sending a message", async () => {
    // Validates that attached images are removed after successful send.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;
    const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;

    const file = new File(["img"], "clear-me.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(container.querySelectorAll("img[alt='clear-me.png']").length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.change(textarea, { target: { value: "sending" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    // Images should be cleared
    await waitFor(() => {
      expect(container.querySelectorAll("img[alt='clear-me.png']").length).toBe(0);
    });
  });

  it("ignores non-image files in file input", async () => {
    // Validates that non-image files are skipped during file selection.
    const { container } = render(<Composer sessionId="s1" />);
    const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;

    const file = new File(["text"], "doc.txt", { type: "text/plain" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    // Small delay to allow any async processing
    await waitFor(() => {
      expect(container.querySelectorAll("img")).toHaveLength(0);
    });
  });

  it("clicking the attach image button triggers file input", () => {
    // Validates the + button (attach image) opens the file picker.
    const { container } = render(<Composer sessionId="s1" />);
    const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");

    // Click the desktop "Attach image" button
    fireEvent.click(screen.getAllByTitle("Attach image")[0]);

    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});

// ─── Save prompt dialog full flow ────────────────────────────────────────────

describe("Composer save prompt dialog", () => {
  it("opens save prompt dialog and populates default name from text", () => {
    // Validates the save dialog opens with a pre-filled name derived from the current text.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "My great prompt content" } });
    fireEvent.click(screen.getAllByTitle("Save as prompt")[0]);

    const titleInput = screen.getByPlaceholderText("Prompt title") as HTMLInputElement;
    expect(titleInput.value).toBe("My great prompt content");
  });

  it("successfully saves a prompt and closes the dialog", async () => {
    // Validates the full save flow: open dialog -> type name -> save -> dialog closes.
    mockCreatePrompt.mockResolvedValue({
      id: "p-ok",
      name: "Saved",
      content: "Body",
      scope: "global",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "Save me" } });
    fireEvent.click(screen.getAllByTitle("Save as prompt")[0]);
    expect(screen.getByText("Save prompt")).toBeTruthy();

    const titleInput = screen.getByPlaceholderText("Prompt title");
    fireEvent.change(titleInput, { target: { value: "My Prompt" } });
    fireEvent.click(screen.getByText("Save"));

    // After successful save, dialog should close
    await waitFor(() => {
      expect(screen.queryByText("Save prompt")).toBeNull();
    });
  });

  it("cancel button closes the save prompt dialog", () => {
    // Validates the cancel button dismisses the dialog without saving.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "Some text" } });
    fireEvent.click(screen.getAllByTitle("Save as prompt")[0]);
    expect(screen.getByText("Save prompt")).toBeTruthy();

    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Save prompt")).toBeNull();
  });

  it("save button is disabled when prompt name is empty", () => {
    // Validates the Save button cannot be clicked without a title.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "Some text" } });
    fireEvent.click(screen.getAllByTitle("Save as prompt")[0]);

    const titleInput = screen.getByPlaceholderText("Prompt title") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "" } });

    const saveBtn = screen.getByText("Save");
    expect(saveBtn.hasAttribute("disabled")).toBe(true);
  });

  it("clears error when user types in the prompt title input", async () => {
    // Validates that typing in the title field dismisses any previous error message.
    mockCreatePrompt.mockRejectedValue(new Error("Duplicate name"));
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "Body" } });
    fireEvent.click(screen.getAllByTitle("Save as prompt")[0]);

    const titleInput = screen.getByPlaceholderText("Prompt title");
    fireEvent.change(titleInput, { target: { value: "Dup" } });
    fireEvent.click(screen.getByText("Save"));

    // Wait for error to appear
    await screen.findByText("Duplicate name");

    // Type in the title field to clear the error
    fireEvent.change(titleInput, { target: { value: "New name" } });

    await waitFor(() => {
      expect(screen.queryByText("Duplicate name")).toBeNull();
    });
  });

  it("save prompt button is disabled when not connected", () => {
    // Validates the save prompt bookmark button is disabled when CLI is disconnected.
    setupMockStore({ isConnected: false });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    // Even if there's text, button should be disabled
    fireEvent.change(textarea, { target: { value: "text" } });
    const saveButtons = screen.getAllByTitle("Save as prompt");
    saveButtons.forEach((btn) => {
      expect(btn.hasAttribute("disabled")).toBe(true);
    });
  });

  it("toggles save prompt dialog open and closed", () => {
    // Validates clicking the save button a second time closes the dialog.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "Toggle me" } });
    const saveBtn = screen.getAllByTitle("Save as prompt")[0];

    // Open
    fireEvent.click(saveBtn);
    expect(screen.getByText("Save prompt")).toBeTruthy();

    // Close by clicking again
    fireEvent.click(saveBtn);
    expect(screen.queryByText("Save prompt")).toBeNull();
  });
});

// ─── Mode toggle via button click ────────────────────────────────────────────

describe("Composer mode toggle button", () => {
  it("clicking mode toggle switches to plan mode", () => {
    // Validates clicking the mode button sends set_permission_mode with "plan".
    setupMockStore({ isConnected: true, session: { permissionMode: "acceptEdits" } });
    render(<Composer sessionId="s1" />);

    const modeBtn = screen.getAllByTitle("Toggle mode (Shift+Tab)")[0];
    fireEvent.click(modeBtn);

    expect(mockSendToSession).toHaveBeenCalledWith("s1", {
      type: "set_permission_mode",
      mode: "plan",
    });
    expect(mockUpdateSession).toHaveBeenCalledWith("s1", { permissionMode: "plan" });
    expect(mockSetPreviousPermissionMode).toHaveBeenCalledWith("s1", "acceptEdits");
  });

  it("clicking mode toggle restores previous mode from plan", () => {
    // Validates toggling back from plan restores the previous permission mode.
    setupMockStore({ isConnected: true, session: { permissionMode: "plan" } });
    render(<Composer sessionId="s1" />);

    const modeBtn = screen.getAllByTitle("Toggle mode (Shift+Tab)")[0];
    fireEvent.click(modeBtn);

    // Should restore to "acceptEdits" (the previousPermissionMode default)
    expect(mockSendToSession).toHaveBeenCalledWith("s1", {
      type: "set_permission_mode",
      mode: "acceptEdits",
    });
    expect(mockUpdateSession).toHaveBeenCalledWith("s1", { permissionMode: "acceptEdits" });
  });

  it("mode toggle is disabled when not connected", () => {
    // Validates mode button is non-interactive when CLI is disconnected.
    setupMockStore({ isConnected: false });
    render(<Composer sessionId="s1" />);

    const modeBtns = screen.getAllByTitle("Toggle mode (Shift+Tab)");
    modeBtns.forEach((btn) => {
      expect(btn.hasAttribute("disabled")).toBe(true);
    });
  });

  it("displays plan mode label and styling when in plan mode", () => {
    // Validates the mode button shows "plan" label when permission mode is plan.
    setupMockStore({ isConnected: true, session: { permissionMode: "plan" } });
    render(<Composer sessionId="s1" />);

    const modeBtns = screen.getAllByTitle("Toggle mode (Shift+Tab)");
    // At least one should display "plan" text
    const hasPlanLabel = modeBtns.some((btn) => btn.textContent?.toLowerCase().includes("plan"));
    expect(hasPlanLabel).toBe(true);
  });
});

// ─── handleInput and syncCaret ───────────────────────────────────────────────

describe("Composer textarea input handling", () => {
  it("handleInput updates caret position from selection", () => {
    // Validates that typing in the textarea tracks the caret position for mention detection.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    // Simulate typing with a specific selectionStart
    fireEvent.change(textarea, {
      target: { value: "Hello @w", selectionStart: 8 },
    });

    // The textarea value should be updated
    expect(textarea.value).toBe("Hello @w");
  });

  it("syncCaret updates on click", () => {
    // Validates clicking in the textarea updates the internal caret position.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "Some text here" } });
    // Simulate clicking at position 5
    Object.defineProperty(textarea, "selectionStart", { value: 5, writable: true });
    fireEvent.click(textarea);

    // No error should occur — syncCaret should work silently
    expect(textarea.value).toBe("Some text here");
  });

  it("syncCaret updates on keyUp", () => {
    // Validates arrow key navigation updates the caret position for mention detection.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "test" } });
    Object.defineProperty(textarea, "selectionStart", { value: 2, writable: true });
    fireEvent.keyUp(textarea, { key: "ArrowLeft" });

    expect(textarea.value).toBe("test");
  });
});

// ─── Slash menu Tab selection ────────────────────────────────────────────────

describe("Composer slash menu Tab selection", () => {
  it("Tab key selects the highlighted slash command", () => {
    // Validates that Tab fills the command into the textarea without sending.
    setupMockStore({
      session: {
        slash_commands: ["help", "clear"],
        skills: [],
      },
    });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "/" } });
    expect(screen.getByText("/help")).toBeTruthy();

    fireEvent.keyDown(textarea, { key: "Tab", shiftKey: false });

    // Should fill in the first command
    expect(textarea.value).toBe("/help ");
    expect(mockSendToSession).not.toHaveBeenCalled();
  });

  it("ArrowUp wraps to the last item in slash menu", () => {
    // Validates ArrowUp from the first item wraps to the last item.
    setupMockStore({
      session: {
        slash_commands: ["help", "clear"],
        skills: [],
      },
    });
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")! as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "/" } });

    // ArrowUp from index 0 should wrap to last item
    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    fireEvent.keyDown(textarea, { key: "Enter" });

    // Should select the last command (clear)
    expect(textarea.value).toBe("/clear ");
  });
});

// ─── Mention menu keyboard navigation ───────────────────────────────────────

describe("Composer mention menu keyboard", () => {
  it("Escape in mention menu does not send a message", async () => {
    // Validates pressing Escape while the @-mention menu is open does not trigger
    // a message send — the key event should be consumed by the menu handler.
    mockListPrompts.mockResolvedValue([
      {
        id: "p1",
        name: "my-prompt",
        content: "Prompt content",
        scope: "global",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "@my", selectionStart: 3 } });
    await screen.findByText("@my-prompt");

    fireEvent.keyDown(textarea, { key: "Escape" });

    // The Escape should be consumed — no message sent, text unchanged
    expect(mockSendToSession).not.toHaveBeenCalled();
    expect((textarea as HTMLTextAreaElement).value).toBe("@my");
  });

  it("ArrowDown navigates in the mention menu", async () => {
    // Validates arrow navigation cycles through @-mention suggestions.
    mockListPrompts.mockResolvedValue([
      {
        id: "p1",
        name: "alpha",
        content: "Alpha content",
        scope: "global",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "p2",
        name: "beta",
        content: "Beta content",
        scope: "global",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "@", selectionStart: 1 } });
    await screen.findByText("@alpha");

    // Navigate down then select with Tab
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    fireEvent.keyDown(textarea, { key: "Tab", shiftKey: false });

    // Should have selected the second prompt (beta)
    expect((textarea as HTMLTextAreaElement).value).toContain("Beta content");
    expect(mockSendToSession).not.toHaveBeenCalled();
  });

  it("ArrowUp navigates backwards in the mention menu", async () => {
    // Validates ArrowUp navigates upward through @-mention suggestions.
    mockListPrompts.mockResolvedValue([
      {
        id: "p1",
        name: "first",
        content: "First content",
        scope: "global",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "p2",
        name: "second",
        content: "Second content",
        scope: "global",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "@", selectionStart: 1 } });
    await screen.findByText("@first");

    // ArrowUp from first position should wrap to last
    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    // Should have selected the second (last) prompt
    expect((textarea as HTMLTextAreaElement).value).toContain("Second content");
  });

  it("Enter/Tab does nothing when mention menu is open but empty", async () => {
    // Validates Enter does not send when the mention menu is open with no matching prompts.
    mockListPrompts.mockResolvedValue([
      {
        id: "p1",
        name: "unique-name",
        content: "Content",
        scope: "global",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    // Type @ with a query that matches nothing
    fireEvent.change(textarea, { target: { value: "@zzz", selectionStart: 4 } });

    // Small wait for menu to react
    await waitFor(() => {
      // Menu is open but should have no matches for "zzz"
      expect(screen.queryByText("@unique-name")).toBeNull();
    });

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    // Should not send
    expect(mockSendToSession).not.toHaveBeenCalled();
  });

  it("Tab selects a prompt from mention menu", async () => {
    // Validates Tab key inserts the prompt content from the @-mention menu.
    mockListPrompts.mockResolvedValue([
      {
        id: "p1",
        name: "tab-test",
        content: "Tab selected content",
        scope: "global",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    fireEvent.change(textarea, { target: { value: "@tab", selectionStart: 4 } });
    await screen.findByText("@tab-test");

    fireEvent.keyDown(textarea, { key: "Tab", shiftKey: false });

    expect((textarea as HTMLTextAreaElement).value).toContain("Tab selected content");
  });
});

// ─── Codex backend mode label ────────────────────────────────────────────────

describe("Composer codex backend", () => {
  it("shows codex mode labels when backend is codex", () => {
    // Validates that the mode button shows Codex-specific labels (e.g. "auto" instead of "agent").
    setupMockStore({
      isConnected: true,
      session: { backend_type: "codex", permissionMode: "bypassPermissions" },
    });
    render(<Composer sessionId="s1" />);

    const modeBtns = screen.getAllByTitle("Toggle mode (Shift+Tab)");
    const hasAutoLabel = modeBtns.some((btn) => btn.textContent?.toLowerCase().includes("auto"));
    expect(hasAutoLabel).toBe(true);
  });

  it("restores previous codex mode when toggling back from plan", () => {
    // Validates that toggling off plan mode on Codex restores the stored previous mode.
    setupMockStore({
      isConnected: true,
      session: { backend_type: "codex", permissionMode: "plan" },
    });
    // Set previous mode to bypassPermissions (the typical codex default)
    const prevMap = new Map<string, string>();
    prevMap.set("s1", "bypassPermissions");
    (mockStoreState as Record<string, unknown>).previousPermissionMode = prevMap;

    render(<Composer sessionId="s1" />);

    const modeBtn = screen.getAllByTitle("Toggle mode (Shift+Tab)")[0];
    fireEvent.click(modeBtn);

    // Should restore to bypassPermissions from previous mode
    expect(mockSendToSession).toHaveBeenCalledWith("s1", {
      type: "set_permission_mode",
      mode: "bypassPermissions",
    });
  });
});

// ─── Mobile action row rendering ─────────────────────────────────────────────

describe("Composer mobile action row", () => {
  it("renders mobile upload image button", () => {
    // Validates the mobile-specific upload button is present.
    render(<Composer sessionId="s1" />);

    const uploadBtns = screen.getAllByTitle("Upload image");
    expect(uploadBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("mobile upload button is disabled when not connected", () => {
    // Validates the mobile upload button is disabled when CLI is disconnected.
    setupMockStore({ isConnected: false });
    render(<Composer sessionId="s1" />);

    const uploadBtns = screen.getAllByTitle("Upload image");
    uploadBtns.forEach((btn) => {
      expect(btn.hasAttribute("disabled")).toBe(true);
    });
  });
});

// ─── Plan mode border styling ────────────────────────────────────────────────

describe("Composer plan mode styling", () => {
  it("applies plan mode border class when in plan mode", () => {
    // Validates the input container gets a distinct border in plan mode.
    setupMockStore({ isConnected: true, session: { permissionMode: "plan" } });
    const { container } = render(<Composer sessionId="s1" />);

    // The outer container div should have the plan border class
    const inputContainer = container.querySelector(".sm\\:border-cc-primary\\/40");
    expect(inputContainer).toBeTruthy();
  });
});

// ─── Push-to-talk keyboard shortcut ──────────────────────────────────────────

describe("Composer push-to-talk keyboard shortcut", () => {
  it("Ctrl+Shift+M does nothing when deepgram is not configured", () => {
    // Validates the keyboard shortcut is inactive without Deepgram setup.
    const { container } = render(<Composer sessionId="s1" />);
    const textarea = container.querySelector("textarea")!;

    // Should not throw; deepgramConfigured defaults to false
    fireEvent.keyDown(textarea, { key: "m", ctrlKey: true, shiftKey: true });

    expect(mockSendToSession).not.toHaveBeenCalled();
  });
});
