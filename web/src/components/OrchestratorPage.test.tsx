// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockApi = {
  list: vi.fn(),
  listAllRuns: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  startRun: vi.fn(),
};

vi.mock("../orchestrator-api.js", () => ({
  orchestratorApi: {
    list: (...args: unknown[]) => mockApi.list(...args),
    listAllRuns: (...args: unknown[]) => mockApi.listAllRuns(...args),
    create: (...args: unknown[]) => mockApi.create(...args),
    update: (...args: unknown[]) => mockApi.update(...args),
    delete: (...args: unknown[]) => mockApi.delete(...args),
    startRun: (...args: unknown[]) => mockApi.startRun(...args),
  },
}));

import { OrchestratorPage } from "./OrchestratorPage.js";

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeOrchestrator(overrides = {}) {
  return {
    id: "orch-1",
    version: 1,
    name: "Test Orchestrator",
    description: "A test orchestrator",
    icon: "",
    stages: [{ name: "Build", prompt: "Build it" }],
    backendType: "claude",
    defaultModel: "sonnet",
    defaultPermissionMode: "default",
    cwd: "/workspace",
    envSlug: "dev",
    containerMode: "shared",
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalRuns: 0,
    ...overrides,
  };
}

function makeRun(overrides = {}) {
  return {
    id: "run-1",
    orchestratorId: "orch-1",
    orchestratorName: "Test Orchestrator",
    status: "completed",
    stages: [],
    createdAt: Date.now(),
    totalCostUsd: 0,
    ...overrides,
  };
}

const defaultRoute = { page: "orchestrators" as const };

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.list.mockResolvedValue([]);
  mockApi.listAllRuns.mockResolvedValue([]);
  window.location.hash = "#/orchestrators";
});

describe("OrchestratorPage", () => {
  // ── Render States ──────────────────────────────────────────────────────────

  it("renders loading state initially", () => {
    // The component shows "Loading..." text while the API call is pending.
    // We use a never-resolving promise to keep the loading state visible.
    mockApi.list.mockReturnValue(new Promise(() => {}));
    mockApi.listAllRuns.mockReturnValue(new Promise(() => {}));
    render(<OrchestratorPage route={defaultRoute} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders empty state when no orchestrators exist", async () => {
    // When the API returns an empty list, the component shows a friendly
    // empty state with a prompt to create an orchestrator.
    mockApi.list.mockResolvedValue([]);
    render(<OrchestratorPage route={defaultRoute} />);
    await waitFor(() => {
      expect(screen.getByText("No orchestrators yet")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Create an orchestrator to chain multiple sessions into a pipeline.",
      ),
    ).toBeInTheDocument();
  });

  it("renders orchestrator cards after loading", async () => {
    // After the API returns orchestrators, each one should render as a card
    // displaying its name and description.
    const orch = makeOrchestrator({
      id: "o1",
      name: "My Pipeline",
      description: "Runs all the things",
    });
    mockApi.list.mockResolvedValue([orch]);
    render(<OrchestratorPage route={defaultRoute} />);
    await screen.findByText("My Pipeline");
    expect(screen.getByText("Runs all the things")).toBeInTheDocument();
  });

  it("renders multiple orchestrator cards", async () => {
    // Multiple orchestrators should all appear in the list view.
    const orchs = [
      makeOrchestrator({ id: "o1", name: "Pipeline Alpha", description: "First" }),
      makeOrchestrator({ id: "o2", name: "Pipeline Beta", description: "Second" }),
    ];
    mockApi.list.mockResolvedValue(orchs);
    render(<OrchestratorPage route={defaultRoute} />);
    await screen.findByText("Pipeline Alpha");
    expect(screen.getByText("Pipeline Beta")).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  // ── Orchestrator Card Info ────────────────────────────────────────────────

  it("card shows stages count, enabled badge, backend badge, and container mode badge", async () => {
    // Validates that an orchestrator card displays the correct metadata badges:
    // stage count, enabled/disabled status, backend type, and container mode.
    const orch = makeOrchestrator({
      id: "o1",
      name: "Full Card",
      stages: [
        { name: "Build", prompt: "build it" },
        { name: "Test", prompt: "test it" },
        { name: "Deploy", prompt: "deploy it" },
      ],
      backendType: "claude",
      containerMode: "per-stage",
      enabled: true,
    });
    mockApi.list.mockResolvedValue([orch]);
    render(<OrchestratorPage route={defaultRoute} />);

    await screen.findByText("Full Card");
    // Stage count badge
    expect(screen.getByText("3 stages")).toBeInTheDocument();
    // Enabled badge
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    // Backend badge
    expect(screen.getByText("Claude")).toBeInTheDocument();
    // Container mode badge
    expect(screen.getByText("per-stage")).toBeInTheDocument();
  });

  it("card shows Disabled badge when orchestrator is not enabled", async () => {
    // Orchestrators can be toggled off. The card should reflect the disabled state.
    const orch = makeOrchestrator({ id: "o1", name: "Disabled Orch", enabled: false });
    mockApi.list.mockResolvedValue([orch]);
    render(<OrchestratorPage route={defaultRoute} />);

    await screen.findByText("Disabled Orch");
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("card shows Codex backend badge for codex orchestrators", async () => {
    // Codex backend type should display "Codex" instead of "Claude".
    const orch = makeOrchestrator({ id: "o1", name: "Codex Orch", backendType: "codex" });
    mockApi.list.mockResolvedValue([orch]);
    render(<OrchestratorPage route={defaultRoute} />);

    await screen.findByText("Codex Orch");
    expect(screen.getByText("Codex")).toBeInTheDocument();
  });

  it("card shows singular 'stage' for exactly 1 stage", async () => {
    // Edge case: singular "stage" instead of "stages" when there is only one.
    const orch = makeOrchestrator({
      id: "o1",
      name: "Single Stage",
      stages: [{ name: "Only", prompt: "do it" }],
    });
    mockApi.list.mockResolvedValue([orch]);
    render(<OrchestratorPage route={defaultRoute} />);

    await screen.findByText("Single Stage");
    expect(screen.getByText("1 stage")).toBeInTheDocument();
  });

  // ── Interactive Behavior ───────────────────────────────────────────────────

  it("clicking '+ New Orchestrator' shows editor in create mode", async () => {
    // Clicking the New Orchestrator button switches from list view to editor view
    // with "New Orchestrator" as the heading and "Create" as the save button text.
    mockApi.list.mockResolvedValue([]);
    render(<OrchestratorPage route={defaultRoute} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ New Orchestrator"));

    expect(screen.getByText("New Orchestrator")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
  });

  it("clicking Cancel in editor returns to list view", async () => {
    // After opening the editor, clicking Cancel should navigate back to
    // the orchestrator list without saving.
    mockApi.list.mockResolvedValue([]);
    render(<OrchestratorPage route={defaultRoute} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ New Orchestrator"));
    expect(screen.getByText("New Orchestrator")).toBeInTheDocument();

    // Click Cancel — there are two Cancel buttons in the editor
    const cancelButtons = screen.getAllByText("Cancel");
    fireEvent.click(cancelButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("No orchestrators yet")).toBeInTheDocument();
    });
  });

  it("clicking Edit on a card opens editor in edit mode with pre-filled data", async () => {
    // Clicking the Edit button on a card should switch to the editor
    // with "Edit Orchestrator" heading and "Save" button, and the form should
    // be pre-populated with the orchestrator's existing data.
    const orch = makeOrchestrator({
      id: "o1",
      name: "Editable Orch",
      description: "Edit me",
    });
    mockApi.list.mockResolvedValue([orch]);
    render(<OrchestratorPage route={defaultRoute} />);

    await screen.findByText("Editable Orch");
    fireEvent.click(screen.getByTitle("Edit"));

    expect(screen.getByText("Edit Orchestrator")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    // Form should be pre-filled with orchestrator data
    expect(screen.getByDisplayValue("Editable Orch")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Edit me")).toBeInTheDocument();
  });

  it("clicking Run opens the input modal", async () => {
    // Clicking Run on an orchestrator card should open a modal that allows
    // the user to optionally provide input text for the run.
    const orch = makeOrchestrator({ id: "o1", name: "Runnable Orch" });
    mockApi.list.mockResolvedValue([orch]);
    render(<OrchestratorPage route={defaultRoute} />);

    await screen.findByText("Runnable Orch");
    fireEvent.click(screen.getByText("Run"));

    // The run input modal should appear with the orchestrator name
    expect(screen.getByText("Run Runnable Orch")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Enter optional input..."),
    ).toBeInTheDocument();
  });

  it("run modal submits input and calls startRun API", async () => {
    // After opening the run modal and clicking the Run button inside it,
    // the startRun API should be called with the orchestrator ID and input.
    const orch = makeOrchestrator({ id: "o1", name: "Run Me" });
    mockApi.list.mockResolvedValue([orch]);
    mockApi.startRun.mockResolvedValue({ id: "run-1" });
    render(<OrchestratorPage route={defaultRoute} />);

    await screen.findByText("Run Me");
    // Click the Run button on the card
    fireEvent.click(screen.getByText("Run"));

    // Type input in the modal textarea
    const textarea = screen.getByPlaceholderText("Enter optional input...");
    fireEvent.change(textarea, { target: { value: "my input" } });

    // Click the Run button in the modal (there are now two "Run" texts visible)
    const runButtons = screen.getAllByText("Run");
    // The last "Run" button is the one inside the modal
    fireEvent.click(runButtons[runButtons.length - 1]);

    await waitFor(() => {
      expect(mockApi.startRun).toHaveBeenCalledWith("o1", "my input");
    });
  });

  it("delete button calls delete API after confirmation", async () => {
    // Clicking the Delete button should trigger a confirm dialog, then call
    // the delete API and refresh the orchestrator list.
    const orch = makeOrchestrator({ id: "o1", name: "Delete Me" });
    mockApi.list.mockResolvedValue([orch]);
    mockApi.delete.mockResolvedValue({});
    window.confirm = vi.fn().mockReturnValue(true);

    render(<OrchestratorPage route={defaultRoute} />);
    await screen.findByText("Delete Me");
    fireEvent.click(screen.getByTitle("Delete"));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith("Delete this orchestrator?");
      expect(mockApi.delete).toHaveBeenCalledWith("o1");
    });
  });

  it("toggle button calls update API to flip enabled state", async () => {
    // Clicking the toggle button (Enable/Disable) should call the update API
    // with the opposite enabled value.
    const orch = makeOrchestrator({ id: "o1", name: "Toggle Me", enabled: true });
    mockApi.list.mockResolvedValue([orch]);
    mockApi.update.mockResolvedValue({});

    render(<OrchestratorPage route={defaultRoute} />);
    await screen.findByText("Toggle Me");
    fireEvent.click(screen.getByTitle("Disable"));

    await waitFor(() => {
      expect(mockApi.update).toHaveBeenCalledWith("o1", { enabled: false });
    });
  });

  // ── Editor Form ────────────────────────────────────────────────────────────

  it("editor stage add and remove works", async () => {
    // The stages builder allows adding new stages via "+ Add Stage" and
    // removing them via the remove button. The minimum is 1 stage.
    mockApi.list.mockResolvedValue([]);
    render(<OrchestratorPage route={defaultRoute} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ New Orchestrator"));

    // Default form starts with 1 stage
    expect(screen.getByText("Stages (1)")).toBeInTheDocument();

    // Add a second stage
    fireEvent.click(screen.getByText("+ Add Stage"));
    expect(screen.getByText("Stages (2)")).toBeInTheDocument();

    // Remove one stage (first remove button is the one for stage 1,
    // but remove is disabled when only 1 stage remains, so both should be enabled now)
    const removeButtons = screen.getAllByTitle("Remove stage");
    fireEvent.click(removeButtons[0]);
    expect(screen.getByText("Stages (1)")).toBeInTheDocument();
  });

  it("editor backend toggle switches between Claude and Codex", async () => {
    // The editor has a backend type toggle with Claude and Codex options.
    // Clicking Codex should switch the backend type.
    mockApi.list.mockResolvedValue([]);
    render(<OrchestratorPage route={defaultRoute} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ New Orchestrator"));

    // Default backend is Claude. Both buttons should be present.
    const claudeBtn = screen.getByRole("button", { name: "Claude" });
    const codexBtn = screen.getByRole("button", { name: "Codex" });
    expect(claudeBtn).toBeInTheDocument();
    expect(codexBtn).toBeInTheDocument();

    // Click Codex to switch
    fireEvent.click(codexBtn);

    // The Codex button should now have the active styles (bg-cc-card)
    expect(codexBtn.className).toContain("bg-cc-card");
  });

  it("editor container mode toggle switches between Shared and Per-stage", async () => {
    // The editor has a container mode toggle with Shared and Per-stage options.
    mockApi.list.mockResolvedValue([]);
    render(<OrchestratorPage route={defaultRoute} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ New Orchestrator"));

    // Default container mode is Shared. Both buttons should be present.
    const sharedBtn = screen.getByRole("button", { name: "Shared" });
    const perStageBtn = screen.getByRole("button", { name: "Per-stage" });
    expect(sharedBtn).toBeInTheDocument();
    expect(perStageBtn).toBeInTheDocument();

    // Click Per-stage to switch
    fireEvent.click(perStageBtn);

    // The Per-stage button should now have the active styles (bg-cc-card)
    expect(perStageBtn.className).toContain("bg-cc-card");
  });

  // ── Recent Runs ────────────────────────────────────────────────────────────

  it("renders recent runs section when runs exist", async () => {
    // When there are recent runs, a "Recent Runs" section should appear
    // showing run status, orchestrator name, and stage progress.
    const orch = makeOrchestrator({ id: "o1", name: "Pipeline" });
    const run = makeRun({
      id: "run-1",
      orchestratorId: "o1",
      orchestratorName: "Pipeline",
      status: "completed",
      stages: [
        { index: 0, name: "Build", status: "completed" },
        { index: 1, name: "Test", status: "completed" },
      ],
    });
    mockApi.list.mockResolvedValue([orch]);
    mockApi.listAllRuns.mockResolvedValue([run]);
    render(<OrchestratorPage route={defaultRoute} />);

    await screen.findByText("Recent Runs");
    // Run status badge
    expect(screen.getByText("completed")).toBeInTheDocument();
    // Orchestrator name in run row
    expect(screen.getAllByText("Pipeline").length).toBeGreaterThanOrEqual(2);
    // Stage progress
    expect(screen.getByText("2/2 stages")).toBeInTheDocument();
  });

  // ── Header ─────────────────────────────────────────────────────────────────

  it("header shows 'Orchestrators' title and description", async () => {
    // The page header displays the title and a short description of what orchestrators are.
    render(<OrchestratorPage route={defaultRoute} />);
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Orchestrators")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Multi-stage pipelines. Chain multiple Claude/Codex sessions sequentially.",
      ),
    ).toBeInTheDocument();
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  // Known pre-existing accessibility issues in OrchestratorPage component:
  // - Cards use <h3> directly (heading-order skip from page <h1>)
  // - Icon-only back button in editor lacks aria-label
  // - Some buttons are icon-only without text labels
  // - Select elements may not have programmatically linked labels
  const axeRules = {
    rules: {
      label: { enabled: false },
      "heading-order": { enabled: false },
      "button-name": { enabled: false },
      "select-name": { enabled: false },
    },
  };

  it("passes axe accessibility checks on empty state", async () => {
    // The empty state (no orchestrators) should have no accessibility violations
    // beyond the known issues documented above.
    const { axe } = await import("vitest-axe");
    mockApi.list.mockResolvedValue([]);
    const { container } = render(<OrchestratorPage route={defaultRoute} />);
    await waitFor(() => {
      expect(screen.getByText("No orchestrators yet")).toBeInTheDocument();
    });
    const results = await axe(container, axeRules);
    expect(results).toHaveNoViolations();
  });

  it("passes axe accessibility checks with orchestrator cards", async () => {
    // The list view with orchestrator cards should have no accessibility violations
    // beyond the known issues documented above.
    const { axe } = await import("vitest-axe");
    const orch = makeOrchestrator({
      id: "o1",
      name: "Accessible Orch",
      description: "This orchestrator is accessible",
    });
    mockApi.list.mockResolvedValue([orch]);
    const { container } = render(<OrchestratorPage route={defaultRoute} />);
    await screen.findByText("Accessible Orch");
    const results = await axe(container, axeRules);
    expect(results).toHaveNoViolations();
  });

  it("passes axe accessibility checks in editor view", async () => {
    // The orchestrator editor form should have no accessibility violations
    // beyond the known issues documented above.
    const { axe } = await import("vitest-axe");
    mockApi.list.mockResolvedValue([]);
    const { container } = render(<OrchestratorPage route={defaultRoute} />);
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("+ New Orchestrator"));
    const results = await axe(container, axeRules);
    expect(results).toHaveNoViolations();
  });
});
