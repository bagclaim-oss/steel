// @vitest-environment jsdom
/**
 * Tests for the LinearAgentWizard component.
 *
 * Validates:
 * - Rendering with step indicator across all wizard steps
 * - Accessibility (axe scan)
 * - Step navigation (Next/Back buttons)
 * - Starting step detection based on OAuth status
 * - OAuth redirect return handling (oauth_success / oauth_error in hash)
 * - Credential saving via API
 * - Agent creation with correct payload (Linear trigger enabled)
 * - sessionStorage persistence across OAuth redirect
 * - Error handling for API failures
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── Mock state ──────────────────────────────────────────────────────────────

interface MockStoreState {
  publicUrl: string;
}

let mockState: MockStoreState;

const mockApi = {
  getLinearOAuthStatus: vi.fn(),
  getLinearOAuthAuthorizeUrl: vi.fn(),
  updateSettings: vi.fn(),
  createAgent: vi.fn(),
};

vi.mock("../api.js", () => ({
  api: {
    getLinearOAuthStatus: (...args: unknown[]) => mockApi.getLinearOAuthStatus(...args),
    getLinearOAuthAuthorizeUrl: (...args: unknown[]) => mockApi.getLinearOAuthAuthorizeUrl(...args),
    updateSettings: (...args: unknown[]) => mockApi.updateSettings(...args),
    createAgent: (...args: unknown[]) => mockApi.createAgent(...args),
  },
}));

vi.mock("../store.js", () => {
  const useStoreFn = (selector: (state: MockStoreState) => unknown) => selector(mockState);
  useStoreFn.getState = () => mockState;
  return { useStore: useStoreFn };
});

// Mock FolderPicker to avoid file-system API calls in tests
vi.mock("./FolderPicker.js", () => ({
  FolderPicker: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="folder-picker">
      <button onClick={onClose}>Close Picker</button>
    </div>
  ),
}));

// Mock LinearLogo to avoid SVG import issues
vi.mock("./LinearLogo.js", () => ({
  LinearLogo: ({ className }: { className?: string }) => (
    <span data-testid="linear-logo" className={className} />
  ),
}));

import { LinearAgentWizard } from "./LinearAgentWizard.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const defaultOAuthStatus = {
  configured: false,
  hasClientId: false,
  hasClientSecret: false,
  hasWebhookSecret: false,
  hasAccessToken: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockState = { publicUrl: "https://companion.example.com" };
  mockApi.getLinearOAuthStatus.mockResolvedValue(defaultOAuthStatus);
  mockApi.updateSettings.mockResolvedValue({});
  mockApi.createAgent.mockResolvedValue({
    id: "linear-agent",
    name: "Linear Agent",
    triggers: { linear: { enabled: true } },
  });
  sessionStorage.clear();
  window.location.hash = "#/setup/linear-agent";
});

afterEach(() => {
  window.location.hash = "";
});

// =============================================================================
// Render Tests
// =============================================================================

describe("LinearAgentWizard", () => {
  it("renders the wizard with step indicator and header", async () => {
    render(<LinearAgentWizard />);

    // Wait for loading to finish (OAuth status check)
    await waitFor(() => {
      expect(screen.getByText("Linear Agent Setup")).toBeInTheDocument();
    });

    // Step indicator should be visible
    expect(screen.getByLabelText(/Step 1/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Step 2/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Step 3/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Step 4/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Step 5/)).toBeInTheDocument();
  });

  it("shows Step 1 by default when OAuth is not configured", async () => {
    render(<LinearAgentWizard />);

    await waitFor(() => {
      expect(screen.getByText("Set up the Linear Agent")).toBeInTheDocument();
    });

    // Step 1 content: prerequisites
    expect(screen.getByText("Prerequisites")).toBeInTheDocument();
    expect(screen.getByText("Create a Linear OAuth app")).toBeInTheDocument();
  });

  it("shows Step 3 when credentials are saved but not installed", async () => {
    // configured=false because it requires accessToken, but hasClientId=true means creds were saved
    mockApi.getLinearOAuthStatus.mockResolvedValue({
      ...defaultOAuthStatus,
      configured: false,
      hasClientId: true,
      hasClientSecret: true,
      hasWebhookSecret: true,
      hasAccessToken: false,
    });

    render(<LinearAgentWizard />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Install to Workspace" })).toBeInTheDocument();
    });
  });

  it("shows Step 4 when OAuth is already connected", async () => {
    mockApi.getLinearOAuthStatus.mockResolvedValue({
      ...defaultOAuthStatus,
      configured: true,
      hasClientId: true,
      hasClientSecret: true,
      hasAccessToken: true,
    });

    render(<LinearAgentWizard />);

    await waitFor(() => {
      expect(screen.getByText("Configure Your Agent")).toBeInTheDocument();
    });
  });

  // ─── Accessibility ─────────────────────────────────────────────────────────

  it("passes axe accessibility checks on Step 1", async () => {
    const { axe } = await import("vitest-axe");
    const { container } = render(<LinearAgentWizard />);

    await waitFor(() => {
      expect(screen.getByText("Set up the Linear Agent")).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // ─── Step Navigation ──────────────────────────────────────────────────────

  it("navigates from Step 1 to Step 2 when Next is clicked", async () => {
    render(<LinearAgentWizard />);

    await waitFor(() => {
      expect(screen.getByText("Set up the Linear Agent")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Next"));

    await waitFor(() => {
      expect(screen.getByText("Enter OAuth Credentials")).toBeInTheDocument();
    });
  });

  it("navigates back from Step 2 to Step 1", async () => {
    render(<LinearAgentWizard />);

    await waitFor(() => {
      expect(screen.getByText("Set up the Linear Agent")).toBeInTheDocument();
    });

    // Go to step 2
    fireEvent.click(screen.getByText("Next"));
    await waitFor(() => {
      expect(screen.getByText("Enter OAuth Credentials")).toBeInTheDocument();
    });

    // Go back to step 1
    fireEvent.click(screen.getByText("Back"));
    await waitFor(() => {
      expect(screen.getByText("Set up the Linear Agent")).toBeInTheDocument();
    });
  });

  // ─── Step 2: Credentials ──────────────────────────────────────────────────

  it("saves credentials and advances to Step 3", async () => {
    render(<LinearAgentWizard />);

    // Navigate to step 2
    await waitFor(() => {
      expect(screen.getByText("Set up the Linear Agent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Next"));

    await waitFor(() => {
      expect(screen.getByText("Enter OAuth Credentials")).toBeInTheDocument();
    });

    // Fill in credentials
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "client-id-123" } });
    fireEvent.change(screen.getByLabelText("Client Secret"), { target: { value: "client-secret-456" } });
    fireEvent.change(screen.getByLabelText("Webhook Signing Secret"), { target: { value: "webhook-secret-789" } });

    // Save
    fireEvent.click(screen.getByText("Save Credentials"));

    await waitFor(() => {
      expect(mockApi.updateSettings).toHaveBeenCalledWith({
        linearOAuthClientId: "client-id-123",
        linearOAuthClientSecret: "client-secret-456",
        linearOAuthWebhookSecret: "webhook-secret-789",
      });
    });

    // Should show success and Next button
    await waitFor(() => {
      expect(screen.getByText("Credentials saved successfully.")).toBeInTheDocument();
    });

    // Advance to step 3
    fireEvent.click(screen.getByText("Next"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Install to Workspace" })).toBeInTheDocument();
    });
  });

  it("shows error when credentials save fails", async () => {
    mockApi.updateSettings.mockRejectedValue(new Error("Network error"));

    render(<LinearAgentWizard />);

    // Navigate to step 2
    await waitFor(() => {
      expect(screen.getByText("Set up the Linear Agent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Next"));

    await waitFor(() => {
      expect(screen.getByText("Enter OAuth Credentials")).toBeInTheDocument();
    });

    // Fill and save
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "id" } });
    fireEvent.change(screen.getByLabelText("Client Secret"), { target: { value: "secret" } });
    fireEvent.change(screen.getByLabelText("Webhook Signing Secret"), { target: { value: "webhook" } });
    fireEvent.click(screen.getByText("Save Credentials"));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  // ─── Step 3: OAuth Return ─────────────────────────────────────────────────

  it("detects oauth_success in hash and advances to Step 4", async () => {
    // Simulate returning from OAuth redirect with success
    window.location.hash = "#/setup/linear-agent?oauth_success=true";

    mockApi.getLinearOAuthStatus.mockResolvedValue({
      ...defaultOAuthStatus,
      configured: true,
      hasClientId: true,
      hasAccessToken: true,
    });

    render(<LinearAgentWizard />);

    // Should advance to step 4 (agent configuration)
    await waitFor(() => {
      expect(screen.getByText("Configure Your Agent")).toBeInTheDocument();
    });
  });

  it("detects oauth_error in hash and shows error on Step 3", async () => {
    // Simulate persisted state so we return to step 3
    sessionStorage.setItem("companion_linear_wizard_state", JSON.stringify({
      step: 3,
      credentialsSaved: true,
      oauthConnected: false,
      agentName: "",
      createdAgentId: null,
    }));

    window.location.hash = "#/setup/linear-agent?oauth_error=access_denied";

    mockApi.getLinearOAuthStatus.mockResolvedValue({
      ...defaultOAuthStatus,
      configured: false,
      hasClientId: true,
      hasAccessToken: false,
    });

    render(<LinearAgentWizard />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Install to Workspace" })).toBeInTheDocument();
    });

    expect(screen.getByText("access_denied")).toBeInTheDocument();
  });

  // ─── Step 4: Agent Creation ────────────────────────────────────────────────

  it("creates agent with Linear trigger enabled and advances to Step 5", async () => {
    // Start at step 4 (OAuth already connected)
    mockApi.getLinearOAuthStatus.mockResolvedValue({
      ...defaultOAuthStatus,
      configured: true,
      hasAccessToken: true,
    });

    render(<LinearAgentWizard />);

    await waitFor(() => {
      expect(screen.getByText("Configure Your Agent")).toBeInTheDocument();
    });

    // Default name is "Linear Agent" — just click create
    fireEvent.click(screen.getByText("Create Agent"));

    await waitFor(() => {
      expect(mockApi.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Linear Agent",
          permissionMode: "bypassPermissions",
          triggers: expect.objectContaining({
            linear: { enabled: true },
          }),
          enabled: true,
        }),
      );
    });

    // Should advance to step 5
    await waitFor(() => {
      expect(screen.getByText("Setup Complete")).toBeInTheDocument();
    });

    // Summary should show agent name
    expect(screen.getByText(/Agent "Linear Agent" created/)).toBeInTheDocument();
  });

  it("shows error when agent creation fails", async () => {
    mockApi.getLinearOAuthStatus.mockResolvedValue({
      ...defaultOAuthStatus,
      configured: true,
      hasAccessToken: true,
    });
    mockApi.createAgent.mockRejectedValue(new Error("Agent name already exists"));

    render(<LinearAgentWizard />);

    await waitFor(() => {
      expect(screen.getByText("Configure Your Agent")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Create Agent"));

    await waitFor(() => {
      expect(screen.getByText("Agent name already exists")).toBeInTheDocument();
    });

    // Should still be on step 4
    expect(screen.getByText("Configure Your Agent")).toBeInTheDocument();
  });

  // ─── Step 5: Done ─────────────────────────────────────────────────────────

  it("navigates to agents page when Finish is clicked", async () => {
    // Start at step 4 with OAuth connected
    mockApi.getLinearOAuthStatus.mockResolvedValue({
      ...defaultOAuthStatus,
      configured: true,
      hasAccessToken: true,
    });

    render(<LinearAgentWizard />);

    await waitFor(() => {
      expect(screen.getByText("Configure Your Agent")).toBeInTheDocument();
    });

    // Create agent to get to step 5
    fireEvent.click(screen.getByText("Create Agent"));

    await waitFor(() => {
      expect(screen.getByText("Setup Complete")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Go to Agents"));

    expect(window.location.hash).toBe("#/agents");
  });

  // ─── sessionStorage Persistence ────────────────────────────────────────────

  it("restores wizard state from sessionStorage after OAuth redirect", async () => {
    // Simulate wizard state saved before OAuth redirect
    sessionStorage.setItem("companion_linear_wizard_state", JSON.stringify({
      step: 3,
      credentialsSaved: true,
      oauthConnected: false,
      agentName: "",
      createdAgentId: null,
    }));

    // Simulate successful OAuth return
    window.location.hash = "#/setup/linear-agent?oauth_success=true";
    mockApi.getLinearOAuthStatus.mockResolvedValue({
      ...defaultOAuthStatus,
      configured: true,
      hasAccessToken: true,
    });

    render(<LinearAgentWizard />);

    // Should skip to step 4 since OAuth is now connected
    await waitFor(() => {
      expect(screen.getByText("Configure Your Agent")).toBeInTheDocument();
    });

    // sessionStorage should be cleared after restore
    expect(sessionStorage.getItem("companion_linear_wizard_state")).toBeNull();
  });

  // ─── Cancel ────────────────────────────────────────────────────────────────

  it("navigates to integrations page when Cancel is clicked", async () => {
    render(<LinearAgentWizard />);

    await waitFor(() => {
      expect(screen.getByText("Linear Agent Setup")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Cancel"));

    expect(window.location.hash).toBe("#/integrations");
  });

  // ─── Public URL warning ────────────────────────────────────────────────────

  it("shows warning when public URL is not configured", async () => {
    mockState = { publicUrl: "" };

    render(<LinearAgentWizard />);

    await waitFor(() => {
      expect(screen.getByText("Set up the Linear Agent")).toBeInTheDocument();
    });

    // Should show warning about missing public URL
    expect(screen.getByText(/No public URL set/)).toBeInTheDocument();
  });

  it("shows green checkmark when public URL is configured", async () => {
    render(<LinearAgentWizard />);

    await waitFor(() => {
      expect(screen.getByText("Set up the Linear Agent")).toBeInTheDocument();
    });

    expect(screen.getByText("Public URL configured")).toBeInTheDocument();
  });
});
