// @vitest-environment jsdom
/**
 * Tests for the EnvironmentPanel component.
 *
 * Validates:
 * - Empty state (no ports configured) shows setup hint
 * - Port pills render with correct labels and status indicators
 * - Clicking an HTTP port pill opens the iframe preview with the proxy URL
 * - Custom URL input navigates to the correct proxy URL
 * - TCP-only ports do not open preview, they trigger a refresh instead
 * - Accessibility (axe scan)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useStore } from "../store.js";
import type { PortStatusInfo } from "../store/environment-slice.js";

const mockCheckPort = vi.fn();

vi.mock("../api.js", () => ({
  api: {
    checkPort: (...args: unknown[]) => mockCheckPort(...args),
  },
}));

import { EnvironmentPanel } from "./EnvironmentPanel.js";

const SESSION_ID = "test-session-1";

function setPortStatuses(ports: PortStatusInfo[]) {
  useStore.getState().setPortStatuses(SESSION_ID, ports);
}

beforeEach(() => {
  mockCheckPort.mockReset();
  // Reset store state for each test
  useStore.getState().clearEnvironment(SESSION_ID);
});

describe("EnvironmentPanel", () => {
  // ─── Empty state ──────────────────────────────────────────────────────
  it("shows setup hint when no ports are configured", () => {
    render(<EnvironmentPanel sessionId={SESSION_ID} />);
    expect(screen.getByText(/No ports configured/)).toBeInTheDocument();
    expect(screen.getByText(".companion/launch.json")).toBeInTheDocument();
    // Also shows the fallback placeholder in the preview area
    expect(screen.getByText("Enter a URL or configure ports in .companion/launch.json")).toBeInTheDocument();
  });

  // ─── Port pills render ───────────────────────────────────────────────
  it("renders port pills with labels and port numbers", () => {
    setPortStatuses([
      { port: 3000, label: "App", protocol: "http", status: "healthy" },
      { port: 5432, label: "Postgres", protocol: "tcp", status: "unknown" },
    ]);
    render(<EnvironmentPanel sessionId={SESSION_ID} />);

    // Port pills should show labels and port numbers
    expect(screen.getByText("App")).toBeInTheDocument();
    expect(screen.getByText(":3000")).toBeInTheDocument();
    expect(screen.getByText("Postgres")).toBeInTheDocument();
    expect(screen.getByText(":5432")).toBeInTheDocument();
  });

  it("shows 'Click a port above to preview' when ports exist but none selected", () => {
    setPortStatuses([
      { port: 3000, label: "App", protocol: "http", status: "healthy" },
    ]);
    render(<EnvironmentPanel sessionId={SESSION_ID} />);
    expect(screen.getByText("Click a port above to preview")).toBeInTheDocument();
  });

  // ─── Port click → iframe ─────────────────────────────────────────────
  it("opens iframe preview when clicking an HTTP port pill", () => {
    setPortStatuses([
      { port: 3000, label: "App", protocol: "http", status: "healthy" },
    ]);
    render(<EnvironmentPanel sessionId={SESSION_ID} />);

    // Click the port pill
    fireEvent.click(screen.getByText("App"));

    // Should render iframe with the correct proxy URL
    const iframe = screen.getByTitle("Environment preview");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute(
      "src",
      `/api/sessions/${SESSION_ID}/browser/host-proxy/3000/`,
    );
  });

  // ─── TCP port → refresh instead of preview ───────────────────────────
  it("triggers health check refresh for TCP-only ports instead of opening preview", () => {
    mockCheckPort.mockResolvedValue({ status: "healthy" });
    setPortStatuses([
      { port: 5432, label: "Postgres", protocol: "tcp", status: "unknown" },
    ]);
    render(<EnvironmentPanel sessionId={SESSION_ID} />);

    // Click the TCP port pill
    fireEvent.click(screen.getByText("Postgres"));

    // Should trigger a health check, not open an iframe
    expect(mockCheckPort).toHaveBeenCalledWith(SESSION_ID, 5432);
    // No iframe should exist
    expect(screen.queryByTitle("Environment preview")).not.toBeInTheDocument();
  });

  // ─── Custom URL input ────────────────────────────────────────────────
  it("navigates to custom URL when clicking Go", () => {
    render(<EnvironmentPanel sessionId={SESSION_ID} />);

    const input = screen.getByPlaceholderText("localhost:3000");
    fireEvent.change(input, { target: { value: "http://localhost:8080/dashboard" } });
    fireEvent.click(screen.getByText("Go"));

    const iframe = screen.getByTitle("Environment preview");
    expect(iframe).toHaveAttribute(
      "src",
      `/api/sessions/${SESSION_ID}/browser/host-proxy/8080/dashboard`,
    );
  });

  it("navigates to custom URL when pressing Enter", () => {
    render(<EnvironmentPanel sessionId={SESSION_ID} />);

    const input = screen.getByPlaceholderText("localhost:3000");
    fireEvent.change(input, { target: { value: "localhost:4000/api" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const iframe = screen.getByTitle("Environment preview");
    expect(iframe).toHaveAttribute(
      "src",
      `/api/sessions/${SESSION_ID}/browser/host-proxy/4000/api`,
    );
  });

  it("defaults to port 80 when no port is specified in URL", () => {
    render(<EnvironmentPanel sessionId={SESSION_ID} />);

    const input = screen.getByPlaceholderText("localhost:3000");
    fireEvent.change(input, { target: { value: "http://localhost/path" } });
    fireEvent.click(screen.getByText("Go"));

    const iframe = screen.getByTitle("Environment preview");
    expect(iframe).toHaveAttribute(
      "src",
      `/api/sessions/${SESSION_ID}/browser/host-proxy/80/path`,
    );
  });

  it("does not navigate when URL input is empty", () => {
    render(<EnvironmentPanel sessionId={SESSION_ID} />);

    fireEvent.click(screen.getByText("Go"));

    // No iframe should appear
    expect(screen.queryByTitle("Environment preview")).not.toBeInTheDocument();
  });

  // ─── Port pill title tooltip ──────────────────────────────────────────
  it("shows correct tooltip with status and TCP-only info", () => {
    setPortStatuses([
      { port: 5432, label: "Postgres", protocol: "tcp", status: "unhealthy", service: "db" },
    ]);
    render(<EnvironmentPanel sessionId={SESSION_ID} />);

    const pill = screen.getByText("Postgres").closest("button");
    expect(pill).toHaveAttribute("title", "Postgres (:5432) — unhealthy (db) (TCP only)");
  });

  // ─── Accessibility ────────────────────────────────────────────────────
  it("passes accessibility scan (empty state)", async () => {
    const { axe } = await import("vitest-axe");
    const { container } = render(<EnvironmentPanel sessionId={SESSION_ID} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes accessibility scan (with ports)", async () => {
    setPortStatuses([
      { port: 3000, label: "App", protocol: "http", status: "healthy" },
      { port: 5432, label: "Postgres", protocol: "tcp", status: "unknown" },
    ]);
    const { axe } = await import("vitest-axe");
    const { container } = render(<EnvironmentPanel sessionId={SESSION_ID} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes accessibility scan (with iframe preview)", async () => {
    setPortStatuses([
      { port: 3000, label: "App", protocol: "http", status: "healthy" },
    ]);
    const { axe } = await import("vitest-axe");
    const { container } = render(<EnvironmentPanel sessionId={SESSION_ID} />);

    // Click port to open iframe
    fireEvent.click(screen.getByText("App"));

    // Remove iframe before axe — axe-core cannot inspect sandboxed iframes in jsdom
    const iframe = container.querySelector("iframe");
    iframe?.remove();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
