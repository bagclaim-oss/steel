// @vitest-environment jsdom
/**
 * Tests for the SessionBrowserPane component.
 *
 * Validates:
 * - Loading state while display stack starts
 * - Error state for non-container sessions
 * - Error state when API returns unavailable
 * - Successful iframe rendering when API returns a URL
 * - URL navigation via input + Enter key
 * - Reload button refreshes the iframe
 * - Accessibility (axe scan)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const mockStartBrowser = vi.fn();
const mockNavigateBrowser = vi.fn();

vi.mock("../api.js", () => ({
  api: {
    startBrowser: (...args: unknown[]) => mockStartBrowser(...args),
    navigateBrowser: (...args: unknown[]) => mockNavigateBrowser(...args),
  },
}));

interface MockSdkSession {
  sessionId: string;
  containerId?: string;
}

let mockSdkSessions: MockSdkSession[] = [];

vi.mock("../store.js", () => ({
  useStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      sdkSessions: mockSdkSessions,
    }),
}));

import { SessionBrowserPane } from "./SessionBrowserPane.js";

beforeEach(() => {
  mockSdkSessions = [
    { sessionId: "s1", containerId: "cid-1" },
  ];
  mockStartBrowser.mockReset();
  mockNavigateBrowser.mockReset();
});

describe("SessionBrowserPane", () => {
  // ─── Render / loading state ───────────────────────────────────────────
  it("shows loading state initially for container sessions", () => {
    // startBrowser never resolves so loading spinner stays visible
    mockStartBrowser.mockReturnValue(new Promise(() => {}));
    render(<SessionBrowserPane sessionId="s1" />);
    expect(screen.getByText("Starting browser preview...")).toBeInTheDocument();
  });

  // ─── Non-container session error ──────────────────────────────────────
  it("shows error message for non-container sessions", () => {
    mockSdkSessions = [{ sessionId: "s1" }]; // no containerId
    render(<SessionBrowserPane sessionId="s1" />);
    expect(screen.getByText("Browser preview is only available for containerized sessions.")).toBeInTheDocument();
  });

  // ─── API returns unavailable ──────────────────────────────────────────
  it("shows error when API returns unavailable", async () => {
    mockStartBrowser.mockResolvedValue({
      available: false,
      mode: "container",
      message: "Xvfb not installed",
    });
    render(<SessionBrowserPane sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("Xvfb not installed")).toBeInTheDocument();
    });
  });

  // ─── API error ────────────────────────────────────────────────────────
  it("shows error when API call throws", async () => {
    mockStartBrowser.mockRejectedValue(new Error("Network error"));
    render(<SessionBrowserPane sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  // ─── Successful iframe rendering ──────────────────────────────────────
  it("renders iframe when API returns a URL", async () => {
    mockStartBrowser.mockResolvedValue({
      available: true,
      mode: "container",
      url: "/api/sessions/s1/browser/proxy/vnc.html?autoconnect=true",
    });
    render(<SessionBrowserPane sessionId="s1" />);
    await waitFor(() => {
      const iframe = screen.getByTitle("Browser preview");
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute("src", "/api/sessions/s1/browser/proxy/vnc.html?autoconnect=true");
    });
  });

  // ─── Auth token injection ────────────────────────────────────────────
  it("injects auth token into noVNC WebSocket path for remote server support", async () => {
    // Simulate an auth token being stored (as happens on remote deployments)
    localStorage.setItem("companion_auth_token", "test-secret-token");
    mockStartBrowser.mockResolvedValue({
      available: true,
      mode: "container",
      url: "/api/sessions/s1/browser/proxy/vnc.html?autoconnect=true&resize=scale&path=ws/novnc/s1",
    });
    render(<SessionBrowserPane sessionId="s1" />);
    await waitFor(() => {
      const iframe = screen.getByTitle("Browser preview");
      expect(iframe).toBeInTheDocument();
      // The path parameter should now include the token so noVNC forwards it on WS connect
      expect(iframe.getAttribute("src")).toContain("path=ws%2Fnovnc%2Fs1%3Ftoken%3Dtest-secret-token");
    });
    localStorage.removeItem("companion_auth_token");
  });

  // ─── Navigation ───────────────────────────────────────────────────────
  it("calls navigateBrowser when pressing Enter in the URL input", async () => {
    mockStartBrowser.mockResolvedValue({
      available: true,
      mode: "container",
      url: "/api/sessions/s1/browser/proxy/vnc.html",
    });
    mockNavigateBrowser.mockResolvedValue({ ok: true });

    render(<SessionBrowserPane sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByTitle("Browser preview")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Navigate URL");
    fireEvent.change(input, { target: { value: "http://localhost:8080" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockNavigateBrowser).toHaveBeenCalledWith("s1", "http://localhost:8080");
  });

  it("calls navigateBrowser when clicking Go button", async () => {
    mockStartBrowser.mockResolvedValue({
      available: true,
      mode: "container",
      url: "/api/sessions/s1/browser/proxy/vnc.html",
    });
    mockNavigateBrowser.mockResolvedValue({ ok: true });

    render(<SessionBrowserPane sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByTitle("Browser preview")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Navigate URL");
    fireEvent.change(input, { target: { value: "http://localhost:5000" } });
    fireEvent.click(screen.getByText("Go"));

    expect(mockNavigateBrowser).toHaveBeenCalledWith("s1", "http://localhost:5000");
  });

  // ─── Reload button ────────────────────────────────────────────────────
  it("reload button resets iframe src", async () => {
    mockStartBrowser.mockResolvedValue({
      available: true,
      mode: "container",
      url: "/api/sessions/s1/browser/proxy/vnc.html",
    });

    render(<SessionBrowserPane sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByTitle("Browser preview")).toBeInTheDocument();
    });

    const reloadBtn = screen.getByLabelText("Reload browser");
    // Click reload — the iframe src should be re-assigned
    fireEvent.click(reloadBtn);
    // The iframe should still have the same src (re-assigned)
    expect(screen.getByTitle("Browser preview")).toHaveAttribute(
      "src",
      "/api/sessions/s1/browser/proxy/vnc.html",
    );
  });

  // ─── Accessibility ────────────────────────────────────────────────────
  it("passes accessibility scan (loading state)", async () => {
    mockStartBrowser.mockReturnValue(new Promise(() => {}));
    const { axe } = await import("vitest-axe");
    const { container } = render(<SessionBrowserPane sessionId="s1" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes accessibility scan (active state with toolbar)", async () => {
    mockStartBrowser.mockResolvedValue({
      available: true,
      mode: "container",
      url: "/api/sessions/s1/browser/proxy/vnc.html",
    });
    const { axe } = await import("vitest-axe");
    const { container } = render(<SessionBrowserPane sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByTitle("Browser preview")).toBeInTheDocument();
    });
    // Remove the iframe before axe scan — axe-core cannot inspect sandboxed
    // iframes in jsdom and throws "Respondable target" errors. The toolbar
    // and surrounding structure are still scanned for a11y compliance.
    const iframe = container.querySelector("iframe");
    iframe?.remove();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes accessibility scan (error state)", async () => {
    mockSdkSessions = [{ sessionId: "s1" }]; // non-container
    const { axe } = await import("vitest-axe");
    const { container } = render(<SessionBrowserPane sessionId="s1" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
