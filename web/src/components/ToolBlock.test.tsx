// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolBlock, ToolIcon, getToolIcon, getToolLabel, getPreview } from "./ToolBlock.js";

// ─── getToolIcon ─────────────────────────────────────────────────────────────

describe("getToolIcon", () => {
  it("returns 'terminal' for Bash", () => {
    expect(getToolIcon("Bash")).toBe("terminal");
  });

  it("returns 'file' for Read", () => {
    expect(getToolIcon("Read")).toBe("file");
  });

  it("returns 'file-plus' for Write", () => {
    expect(getToolIcon("Write")).toBe("file-plus");
  });

  it("returns 'file-edit' for Edit", () => {
    expect(getToolIcon("Edit")).toBe("file-edit");
  });

  it("returns 'search' for Glob", () => {
    expect(getToolIcon("Glob")).toBe("search");
  });

  it("returns 'search' for Grep", () => {
    expect(getToolIcon("Grep")).toBe("search");
  });

  it("returns 'globe' for WebFetch", () => {
    expect(getToolIcon("WebFetch")).toBe("globe");
  });

  it("returns 'globe' for WebSearch", () => {
    expect(getToolIcon("WebSearch")).toBe("globe");
  });

  it("returns 'list' for TaskCreate", () => {
    expect(getToolIcon("TaskCreate")).toBe("list");
  });

  it("returns 'message' for SendMessage", () => {
    expect(getToolIcon("SendMessage")).toBe("message");
  });

  it("returns 'tool' for unknown tool names", () => {
    expect(getToolIcon("SomeUnknownTool")).toBe("tool");
    expect(getToolIcon("")).toBe("tool");
    expect(getToolIcon("FooBar")).toBe("tool");
  });
});

// ─── getToolLabel ────────────────────────────────────────────────────────────

describe("getToolLabel", () => {
  it("returns 'Terminal' for Bash", () => {
    expect(getToolLabel("Bash")).toBe("Terminal");
  });

  it("returns 'Read File' for Read", () => {
    expect(getToolLabel("Read")).toBe("Read File");
  });

  it("returns 'Write File' for Write", () => {
    expect(getToolLabel("Write")).toBe("Write File");
  });

  it("returns 'Edit File' for Edit", () => {
    expect(getToolLabel("Edit")).toBe("Edit File");
  });

  it("returns 'Find Files' for Glob", () => {
    expect(getToolLabel("Glob")).toBe("Find Files");
  });

  it("returns 'Search Content' for Grep", () => {
    expect(getToolLabel("Grep")).toBe("Search Content");
  });

  it("returns known labels for newly added tools", () => {
    expect(getToolLabel("WebFetch")).toBe("Web Fetch");
    expect(getToolLabel("Task")).toBe("Subagent");
    expect(getToolLabel("TodoWrite")).toBe("Tasks");
    expect(getToolLabel("NotebookEdit")).toBe("Notebook");
    expect(getToolLabel("SendMessage")).toBe("Message");
  });

  it("returns the name itself for unknown tools", () => {
    expect(getToolLabel("SomeUnknownTool")).toBe("SomeUnknownTool");
    expect(getToolLabel("CustomTool")).toBe("CustomTool");
  });
});

// ─── getPreview ──────────────────────────────────────────────────────────────

describe("getPreview", () => {
  it("extracts command for Bash tools", () => {
    expect(getPreview("Bash", { command: "ls -la" })).toBe("ls -la");
  });

  it("truncates Bash commands longer than 60 chars", () => {
    const longCommand = "a".repeat(80);
    const result = getPreview("Bash", { command: longCommand });
    expect(result).toBe("a".repeat(60) + "...");
    expect(result.length).toBe(63);
  });

  it("does not truncate Bash commands at exactly 60 chars", () => {
    const exactCommand = "b".repeat(60);
    expect(getPreview("Bash", { command: exactCommand })).toBe(exactCommand);
  });

  it("extracts last 2 path segments for Read", () => {
    expect(getPreview("Read", { file_path: "/home/user/project/src/index.ts" })).toBe("src/index.ts");
  });

  it("extracts last 2 path segments for Write", () => {
    expect(getPreview("Write", { file_path: "/var/log/app.log" })).toBe("log/app.log");
  });

  it("extracts last 2 path segments for Edit", () => {
    expect(getPreview("Edit", { file_path: "/a/b/c/d.txt" })).toBe("c/d.txt");
  });

  it("extracts preview from Codex-style Edit changes when file_path is absent", () => {
    expect(getPreview("Edit", {
      changes: [{ path: "/repo/src/foo.ts", kind: "update" }],
    })).toBe("src/foo.ts");
  });

  it("handles short paths for file tools", () => {
    expect(getPreview("Read", { file_path: "file.txt" })).toBe("file.txt");
  });

  it("extracts pattern for Glob", () => {
    expect(getPreview("Glob", { pattern: "**/*.ts" })).toBe("**/*.ts");
  });

  it("extracts pattern for Grep", () => {
    expect(getPreview("Grep", { pattern: "TODO|FIXME" })).toBe("TODO|FIXME");
  });

  it("extracts query for WebSearch", () => {
    expect(getPreview("WebSearch", { query: "react testing library" })).toBe("react testing library");
  });

  it("returns empty string for unknown tools", () => {
    expect(getPreview("UnknownTool", { some: "data" })).toBe("");
  });

  it("returns empty string for Bash without command", () => {
    expect(getPreview("Bash", { description: "something" })).toBe("");
  });

  it("returns empty string for Read without file_path", () => {
    expect(getPreview("Read", { content: "data" })).toBe("");
  });
});

// ─── ToolIcon ────────────────────────────────────────────────────────────────

describe("ToolIcon", () => {
  it("renders an SVG for terminal type", () => {
    const { container } = render(<ToolIcon type="terminal" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.querySelector("polyline")).toBeTruthy();
  });

  it("renders an SVG for file type", () => {
    const { container } = render(<ToolIcon type="file" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.querySelector("path")).toBeTruthy();
  });

  it("renders an SVG for search type", () => {
    const { container } = render(<ToolIcon type="search" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.querySelector("circle")).toBeTruthy();
  });

  it("renders an SVG for globe type", () => {
    const { container } = render(<ToolIcon type="globe" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.querySelector("circle")).toBeTruthy();
  });

  it("renders an SVG for message type", () => {
    const { container } = render(<ToolIcon type="message" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("renders an SVG for list type", () => {
    const { container } = render(<ToolIcon type="list" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("renders a default SVG for unknown type", () => {
    const { container } = render(<ToolIcon type="tool" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.querySelector("path")).toBeTruthy();
  });
});

// ─── ToolBlock component ─────────────────────────────────────────────────────

describe("ToolBlock", () => {
  // Bash uses a borderless inline design — command is always visible, no toggle
  it("renders Bash command directly with $ prefix (no toggle)", () => {
    render(
      <ToolBlock
        name="Bash"
        input={{ command: "echo hello" }}
        toolUseId="tool-1"
      />
    );
    // Command is always visible in a pre block
    const preElement = screen.getByText("echo hello").closest("pre");
    expect(preElement).toBeTruthy();
    // $ prefix rendered as a span
    const dollarSpan = preElement?.querySelector("span");
    expect(dollarSpan?.textContent).toBe("$ ");
  });

  it("renders Bash description when provided", () => {
    render(
      <ToolBlock
        name="Bash"
        input={{ command: "ls -la", description: "List files" }}
        toolUseId="tool-1b"
      />
    );
    expect(screen.getByText("List files")).toBeTruthy();
    expect(screen.getByText("ls -la")).toBeTruthy();
  });

  it("renders with label only when no preview is available", () => {
    render(
      <ToolBlock
        name="WebFetch"
        input={{ url: "https://example.com" }}
        toolUseId="tool-2"
      />
    );
    expect(screen.getByText("Web Fetch")).toBeTruthy();
  });

  // Non-Bash tools still use the card design with toggle
  it("is collapsed by default for non-Bash tools (does not show details)", () => {
    render(
      <ToolBlock
        name="Read"
        input={{ file_path: "/home/user/test.txt" }}
        toolUseId="tool-3"
      />
    );
    // The expanded detail area should not be present
    expect(screen.queryByText("/home/user/test.txt")).toBeNull();
  });

  it("expands non-Bash tool on click to show input details", () => {
    render(
      <ToolBlock
        name="Read"
        input={{ file_path: "/home/user/test.txt" }}
        toolUseId="tool-4"
      />
    );

    // Click the button to expand
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // After expanding, the full file path should be visible
    expect(screen.getByText("/home/user/test.txt")).toBeTruthy();
  });

  it("collapses non-Bash tool on second click", () => {
    render(
      <ToolBlock
        name="Read"
        input={{ file_path: "/home/user/test.txt" }}
        toolUseId="tool-5"
      />
    );

    const button = screen.getByRole("button");

    // Expand
    fireEvent.click(button);
    expect(screen.getByText("/home/user/test.txt")).toBeTruthy();

    // Collapse
    fireEvent.click(button);
    expect(screen.queryByText("/home/user/test.txt")).toBeNull();
  });

  it("renders Bash command always visible without needing expand", () => {
    render(
      <ToolBlock
        name="Bash"
        input={{ command: "npm install" }}
        toolUseId="tool-6"
      />
    );

    // Command is immediately visible — no click needed
    const preElement = screen.getByText("npm install").closest("pre");
    expect(preElement).toBeTruthy();
    const dollarSpan = preElement?.querySelector("span");
    expect(dollarSpan?.textContent).toBe("$ ");
  });

  it("renders Edit inline with diff (no toggle, no card)", () => {
    // Edit renders always visible — no toggle needed
    const { container } = render(
      <ToolBlock
        name="Edit"
        input={{
          file_path: "/home/user/src/app.ts",
          old_string: "const x = 1;",
          new_string: "const x = 2;",
        }}
        toolUseId="tool-7"
      />
    );

    // Header shows "Edit" label and filename once
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.getByText("app.ts")).toBeTruthy();
    // DiffViewer renders del/add lines inline
    expect(container.querySelector(".diff-line-del")).toBeTruthy();
    expect(container.querySelector(".diff-line-add")).toBeTruthy();
  });

  it("renders Codex-style Edit changes list when diff strings are absent", () => {
    // Edit renders always visible with inline design
    render(
      <ToolBlock
        name="Edit"
        input={{
          file_path: "/repo/src/foo.ts",
          changes: [
            { path: "/repo/src/foo.ts", kind: "update" },
            { path: "/repo/src/bar.ts", kind: "create" },
          ],
        }}
        toolUseId="tool-7b"
      />
    );

    // Changes always visible — no click needed
    expect(screen.getByText("update")).toBeTruthy();
    expect(screen.getByText("create")).toBeTruthy();
    // Header shows foo.ts, changes list shows basenames
    expect(screen.getAllByText("foo.ts").length).toBeGreaterThan(0);
    expect(screen.getByText("bar.ts")).toBeTruthy();
  });

  it("renders Read file path when expanded", () => {
    render(
      <ToolBlock
        name="Read"
        input={{ file_path: "/home/user/test.txt" }}
        toolUseId="tool-8"
      />
    );

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("/home/user/test.txt")).toBeTruthy();
  });

  it("renders JSON for unknown tools when expanded", () => {
    render(
      <ToolBlock
        name="CustomTool"
        input={{ foo: "bar", count: 42 }}
        toolUseId="tool-9"
      />
    );

    fireEvent.click(screen.getByRole("button"));
    const preElement = document.querySelector("pre");
    expect(preElement?.textContent).toContain('"foo": "bar"');
    expect(preElement?.textContent).toContain('"count": 42');
  });
});
