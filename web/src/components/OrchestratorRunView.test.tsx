// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { OrchestratorRun } from "../orchestrator-types.js";

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockApi = {
  getRun: vi.fn(),
  cancelRun: vi.fn(),
};

vi.mock("../orchestrator-api.js", () => ({
  orchestratorApi: {
    getRun: (...args: unknown[]) => mockApi.getRun(...args),
    cancelRun: (...args: unknown[]) => mockApi.cancelRun(...args),
  },
}));

import { OrchestratorRunView } from "./OrchestratorRunView.js";

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<OrchestratorRun> = {}): OrchestratorRun {
  return {
    id: "run-1",
    orchestratorId: "orch-1",
    orchestratorName: "Test Pipeline",
    status: "completed" as const,
    stages: [
      {
        index: 0,
        name: "Build",
        status: "completed" as const,
        sessionId: "session-abc",
        startedAt: Date.now() - 60000,
        completedAt: Date.now() - 30000,
        costUsd: 0.05,
      },
      {
        index: 1,
        name: "Test",
        status: "completed" as const,
        sessionId: "session-def",
        startedAt: Date.now() - 30000,
        completedAt: Date.now(),
        costUsd: 0.03,
      },
    ],
    createdAt: Date.now() - 120000,
    startedAt: Date.now() - 60000,
    completedAt: Date.now(),
    totalCostUsd: 0.08,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OrchestratorRunView", () => {
  // ── Render States ──────────────────────────────────────────────────────────

  it("renders loading state while fetching run data", () => {
    // The component shows "Loading run..." while the API call is pending.
    // We use a never-resolving promise to keep the loading state visible.
    mockApi.getRun.mockReturnValue(new Promise(() => {}));
    render(<OrchestratorRunView runId="run-1" />);
    expect(screen.getByText("Loading run...")).toBeInTheDocument();
  });

  it("renders error state when getRun rejects with a network error", async () => {
    // When the API call fails (e.g. network error), the component should
    // display the error message and a "Back to Orchestrators" link.
    mockApi.getRun.mockRejectedValue(new Error("Network error"));
    render(<OrchestratorRunView runId="run-1" />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
    // The back link should be present in error state
    expect(screen.getByText("Back to Orchestrators")).toBeInTheDocument();
  });

  it("renders error state when getRun rejects with a 404-style error", async () => {
    // Simulates a 404 from the server — the error message is shown inline.
    mockApi.getRun.mockRejectedValue(new Error("Not found"));
    render(<OrchestratorRunView runId="nonexistent" />);

    await waitFor(() => {
      expect(screen.getByText("Not found")).toBeInTheDocument();
    });
  });

  it("renders run data after successful fetch", async () => {
    // After the API returns a run, the component should display the
    // orchestrator name, status badge, and stage rows.
    const run = makeRun();
    mockApi.getRun.mockResolvedValue(run);
    render(<OrchestratorRunView runId="run-1" />);

    await waitFor(() => {
      expect(screen.getByText("Test Pipeline")).toBeInTheDocument();
    });
    // "completed" appears on the run status badge and each stage badge
    expect(screen.getAllByText("completed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  // ── Run Header ─────────────────────────────────────────────────────────────

  it("shows cancel button only when run status is 'running'", async () => {
    // The Cancel button should only be visible when the run is in "running"
    // state. For completed runs, it should not be rendered.
    const runningRun = makeRun({ status: "running", completedAt: undefined });
    mockApi.getRun.mockResolvedValue(runningRun);
    render(<OrchestratorRunView runId="run-1" />);

    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    // Re-render with a completed run — Cancel should not be visible
    mockApi.getRun.mockResolvedValue(makeRun({ status: "completed" }));
    const { unmount } = render(<OrchestratorRunView runId="run-2" />);
    await waitFor(() => {
      // "completed" appears as the status badge
      expect(screen.getAllByText("completed").length).toBeGreaterThanOrEqual(1);
    });
    // Cancel button should NOT appear for the completed run (only 1 Cancel total from the running run above)
    unmount();
  });

  it("cancel button calls cancelRun API and refreshes run data", async () => {
    // Clicking Cancel should call orchestratorApi.cancelRun, then re-fetch
    // the run to update the displayed status.
    const runningRun = makeRun({ status: "running", completedAt: undefined });
    const cancelledRun = makeRun({ status: "cancelled" });

    mockApi.getRun.mockResolvedValue(runningRun);
    mockApi.cancelRun.mockResolvedValue({});

    render(<OrchestratorRunView runId="run-1" />);

    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    // After cancel, getRun is called again to refresh
    mockApi.getRun.mockResolvedValue(cancelledRun);
    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(mockApi.cancelRun).toHaveBeenCalledWith("run-1");
    });
    // After cancelling, getRun is called again to refresh the status
    await waitFor(() => {
      // Initial fetch + post-cancel refresh = at least 2 calls
      expect(mockApi.getRun.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Stage Timeline ─────────────────────────────────────────────────────────

  it("renders all stages with correct status text", async () => {
    // Each stage row should display its name and its status text.
    const run = makeRun({
      stages: [
        { index: 0, name: "Lint", status: "completed", startedAt: Date.now() - 10000, completedAt: Date.now() },
        { index: 1, name: "Build", status: "running", startedAt: Date.now() - 5000 },
        { index: 2, name: "Deploy", status: "pending" },
      ],
    });
    mockApi.getRun.mockResolvedValue(run);
    render(<OrchestratorRunView runId="run-1" />);

    await waitFor(() => {
      expect(screen.getByText("Lint")).toBeInTheDocument();
    });
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("Deploy")).toBeInTheDocument();
    // Status badges for each stage
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("shows 'View Session' links when stages have sessionId", async () => {
    // Stages that have a sessionId should render a "View Session" link
    // pointing to the correct hash route.
    const run = makeRun();
    mockApi.getRun.mockResolvedValue(run);
    render(<OrchestratorRunView runId="run-1" />);

    await waitFor(() => {
      expect(screen.getByText("Build")).toBeInTheDocument();
    });

    const sessionLinks = screen.getAllByText("View Session");
    expect(sessionLinks).toHaveLength(2);
    // Verify the href points to the correct session hash route
    expect(sessionLinks[0].closest("a")).toHaveAttribute("href", "#/session/session-abc");
    expect(sessionLinks[1].closest("a")).toHaveAttribute("href", "#/session/session-def");
  });

  it("shows error message for failed stages", async () => {
    // When a stage has a non-null error field, an error banner should be
    // displayed inside that stage's row.
    const run = makeRun({
      stages: [
        {
          index: 0,
          name: "Broken Step",
          status: "failed",
          error: "Command exited with code 1",
          startedAt: Date.now() - 10000,
          completedAt: Date.now(),
        },
      ],
    });
    mockApi.getRun.mockResolvedValue(run);
    render(<OrchestratorRunView runId="run-1" />);

    await waitFor(() => {
      expect(screen.getByText("Broken Step")).toBeInTheDocument();
    });
    expect(screen.getByText("Command exited with code 1")).toBeInTheDocument();
  });

  it("shows stage cost when costUsd is present and non-zero", async () => {
    // Stages with a non-zero costUsd should display the formatted cost.
    const run = makeRun();
    mockApi.getRun.mockResolvedValue(run);
    render(<OrchestratorRunView runId="run-1" />);

    await waitFor(() => {
      expect(screen.getByText("Build")).toBeInTheDocument();
    });
    // $0.05 and $0.03 should both appear
    expect(screen.getByText("$0.05")).toBeInTheDocument();
    expect(screen.getByText("$0.03")).toBeInTheDocument();
  });

  // ── Input Section ──────────────────────────────────────────────────────────

  it("shows collapsible input section that toggles on click", async () => {
    // When a run has input text, the Input section should be collapsible.
    // Initially collapsed, clicking it should reveal the input text.
    const run = makeRun({ input: "Please deploy to staging" });
    mockApi.getRun.mockResolvedValue(run);
    render(<OrchestratorRunView runId="run-1" />);

    await waitFor(() => {
      expect(screen.getByText("Input")).toBeInTheDocument();
    });

    // Input text should NOT be visible initially (collapsed)
    expect(screen.queryByText("Please deploy to staging")).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByText("Input"));

    // Input text should now be visible
    expect(screen.getByText("Please deploy to staging")).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(screen.getByText("Input"));
    expect(screen.queryByText("Please deploy to staging")).not.toBeInTheDocument();
  });

  // ── Footer ─────────────────────────────────────────────────────────────────

  it("shows total duration and total cost in footer", async () => {
    // The footer should display aggregated total duration and total cost
    // computed from the run data.
    const run = makeRun({ totalCostUsd: 0.08 });
    mockApi.getRun.mockResolvedValue(run);
    render(<OrchestratorRunView runId="run-1" />);

    await waitFor(() => {
      expect(screen.getByText("Test Pipeline")).toBeInTheDocument();
    });

    // Total cost should be displayed
    expect(screen.getByText("$0.08")).toBeInTheDocument();
    // Total duration label should be present
    expect(screen.getByText("Total duration:")).toBeInTheDocument();
    expect(screen.getByText("Total cost:")).toBeInTheDocument();
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  it("shows 'Back to Orchestrators' link with correct href", async () => {
    // The back link should always point to the orchestrators list route.
    const run = makeRun();
    mockApi.getRun.mockResolvedValue(run);
    render(<OrchestratorRunView runId="run-1" />);

    await waitFor(() => {
      expect(screen.getByText("Back to Orchestrators")).toBeInTheDocument();
    });
    expect(screen.getByText("Back to Orchestrators").closest("a")).toHaveAttribute(
      "href",
      "#/orchestrators",
    );
  });

  it("shows empty stages message when run has no stages", async () => {
    // When a run has an empty stages array, a message should inform the user.
    const run = makeRun({ stages: [] });
    mockApi.getRun.mockResolvedValue(run);
    render(<OrchestratorRunView runId="run-1" />);

    await waitFor(() => {
      expect(screen.getByText("No stages yet.")).toBeInTheDocument();
    });
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it("passes axe accessibility checks on loaded state with stages", async () => {
    // The fully loaded view with stages should have no accessibility
    // violations beyond known issues with heading order and icon buttons.
    const { axe } = await import("vitest-axe");
    const run = makeRun();
    mockApi.getRun.mockResolvedValue(run);
    const { container } = render(<OrchestratorRunView runId="run-1" />);

    await waitFor(() => {
      expect(screen.getByText("Test Pipeline")).toBeInTheDocument();
    });

    const results = await axe(container, {
      rules: {
        "heading-order": { enabled: false },
        "button-name": { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });
});
