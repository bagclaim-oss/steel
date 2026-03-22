// @vitest-environment jsdom
/**
 * Tests for the OnboardingModal component.
 *
 * This modal appears on first launch when onboardingCompleted is false.
 * It guides users through configuring Claude Code (OAuth token) and Codex (OpenAI API key).
 *
 * Key behaviors tested:
 * - Welcome step renders with provider options
 * - Claude setup step shows command and token input
 * - Codex setup step shows API key input
 * - Saving tokens calls the API correctly
 * - Skip flow marks onboarding as completed
 * - Done step shows correct configured status
 * - Accessibility audit passes
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock the api module
vi.mock("../api.js", () => ({
  api: {
    updateSettings: vi.fn().mockResolvedValue({}),
  },
}));

import { OnboardingModal } from "./OnboardingModal.js";
import { api } from "../api.js";

const mockUpdateSettings = vi.mocked(api.updateSettings);

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateSettings.mockResolvedValue({} as ReturnType<typeof api.updateSettings> extends Promise<infer T> ? T : never);
});

describe("OnboardingModal", () => {
  it("renders the welcome step with provider options", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    expect(screen.getByText("Welcome to The Companion")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
  });

  it("navigates to Claude setup when Claude Code is clicked", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    fireEvent.click(screen.getByText("Claude Code"));
    expect(screen.getByText("Set up Claude Code")).toBeInTheDocument();
    expect(screen.getByText("claude setup-token")).toBeInTheDocument();
  });

  it("navigates to Codex setup when Codex is clicked", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    fireEvent.click(screen.getByText("Codex"));
    expect(screen.getByText("Set up Codex")).toBeInTheDocument();
  });

  it("skips all setup when skip link is clicked", async () => {
    const onComplete = vi.fn();
    render(<OnboardingModal onComplete={onComplete} />);

    fireEvent.click(screen.getByText(/Skip setup/));

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({ onboardingCompleted: true });
    });
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it("saves Claude token and navigates to Codex step", async () => {
    render(<OnboardingModal onComplete={vi.fn()} />);

    // Go to Claude setup
    fireEvent.click(screen.getByText("Claude Code"));
    expect(screen.getByText("Set up Claude Code")).toBeInTheDocument();

    // Enter token
    const input = screen.getByLabelText("OAuth Token");
    fireEvent.change(input, { target: { value: "test-oauth-token" } });

    // Save
    fireEvent.click(screen.getByText("Save & Continue"));

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({ claudeCodeOAuthToken: "test-oauth-token" });
    });

    // Should navigate to Codex step
    await waitFor(() => {
      expect(screen.getByText("Set up Codex")).toBeInTheDocument();
    });
  });

  it("skips Claude step and goes to Codex", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);

    fireEvent.click(screen.getByText("Claude Code"));
    fireEvent.click(screen.getByText("Skip"));

    expect(screen.getByText("Set up Codex")).toBeInTheDocument();
  });

  it("saves Codex API key and completes onboarding", async () => {
    const onComplete = vi.fn();
    render(<OnboardingModal onComplete={onComplete} />);

    // Go directly to Codex setup
    fireEvent.click(screen.getByText("Codex"));

    // Enter API key
    const input = screen.getByLabelText("OpenAI API Key");
    fireEvent.change(input, { target: { value: "sk-test-key" } });

    // Save
    fireEvent.click(screen.getByText("Save & Finish"));

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({ openaiApiKey: "sk-test-key" });
    });

    // Should show done step
    await waitFor(() => {
      expect(screen.getByText("Get Started")).toBeInTheDocument();
    });
  });

  it("navigates back from Codex to Claude step", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);

    // Go to Codex via welcome
    fireEvent.click(screen.getByText("Codex"));
    expect(screen.getByText("Set up Codex")).toBeInTheDocument();

    // Go back
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Set up Claude Code")).toBeInTheDocument();
  });

  it("shows done step with correct configured status", async () => {
    render(<OnboardingModal onComplete={vi.fn()} />);

    // Go to Claude, enter token, save
    fireEvent.click(screen.getByText("Claude Code"));
    const input = screen.getByLabelText("OAuth Token");
    fireEvent.change(input, { target: { value: "token" } });
    fireEvent.click(screen.getByText("Save & Continue"));

    await waitFor(() => {
      expect(screen.getByText("Set up Codex")).toBeInTheDocument();
    });

    // Skip Codex
    fireEvent.click(screen.getByText("Skip"));

    await waitFor(() => {
      expect(screen.getByText("You're all set!")).toBeInTheDocument();
      expect(screen.getByText("Claude Code is ready.")).toBeInTheDocument();
    });
  });

  it("shows 'Setup Skipped' when no providers configured", async () => {
    render(<OnboardingModal onComplete={vi.fn()} />);

    // Skip through Claude and Codex
    fireEvent.click(screen.getByText("Claude Code"));
    fireEvent.click(screen.getByText("Skip"));
    fireEvent.click(screen.getByText("Skip"));

    await waitFor(() => {
      expect(screen.getByText("Setup Skipped")).toBeInTheDocument();
    });
  });

  it("calls onComplete when Get Started is clicked on done step", async () => {
    const onComplete = vi.fn();
    render(<OnboardingModal onComplete={onComplete} />);

    // Skip everything to get to done
    fireEvent.click(screen.getByText("Claude Code"));
    fireEvent.click(screen.getByText("Skip"));
    fireEvent.click(screen.getByText("Skip"));

    await waitFor(() => {
      expect(screen.getByText("Get Started")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Get Started"));
    expect(onComplete).toHaveBeenCalled();
  });

  it("displays error when save fails", async () => {
    mockUpdateSettings.mockRejectedValueOnce(new Error("Network error"));

    render(<OnboardingModal onComplete={vi.fn()} />);

    fireEvent.click(screen.getByText("Claude Code"));
    const input = screen.getByLabelText("OAuth Token");
    fireEvent.change(input, { target: { value: "bad-token" } });
    fireEvent.click(screen.getByText("Save & Continue"));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("passes accessibility audit", async () => {
    const { axe } = await import("vitest-axe");
    render(<OnboardingModal onComplete={vi.fn()} />);
    const results = await axe(document.body);
    expect(results).toHaveNoViolations();
  });
});
