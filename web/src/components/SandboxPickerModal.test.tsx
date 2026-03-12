// @vitest-environment jsdom
/**
 * Tests for SandboxPickerModal component.
 *
 * Validates:
 * - Rendering with Off, Default, and custom sandbox options
 * - Selection callback fires with correct slug and enables sandbox
 * - Off option disables sandbox
 * - Escape key closes the modal
 * - Clicking the backdrop closes the modal
 * - Axe accessibility scan passes
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import { SandboxPickerModal } from "./SandboxPickerModal.js";
import type { CompanionSandbox } from "../api.js";

const makeSandbox = (overrides: Partial<CompanionSandbox> = {}): CompanionSandbox => ({
  name: "Test Sandbox",
  slug: "test-sandbox",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

const defaultProps = {
  sandboxes: [
    makeSandbox({ name: "Dev Sandbox", slug: "dev-sandbox" }),
    makeSandbox({ name: "Custom Image", slug: "custom-img", imageTag: "my-image:latest" }),
  ],
  selectedSandbox: "",
  sandboxEnabled: true,
  onSelect: vi.fn(),
  onToggle: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SandboxPickerModal", () => {
  it("renders the modal with title and all options including Off", () => {
    render(<SandboxPickerModal {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Sandbox")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByText("Default (the-companion:latest)")).toBeInTheDocument();
    expect(screen.getByText("Dev Sandbox")).toBeInTheDocument();
    expect(screen.getByText("Custom Image")).toBeInTheDocument();
  });

  it("shows 'custom' badge for sandboxes with a custom imageTag", () => {
    render(<SandboxPickerModal {...defaultProps} />);
    expect(screen.getByText("custom")).toBeInTheDocument();
  });

  it("highlights the selected sandbox when enabled", () => {
    render(<SandboxPickerModal {...defaultProps} selectedSandbox="dev-sandbox" />);
    const devButton = screen.getByText("Dev Sandbox").closest("button");
    expect(devButton).toHaveClass("text-cc-primary");
  });

  it("highlights 'Off' when sandbox is disabled", () => {
    render(<SandboxPickerModal {...defaultProps} sandboxEnabled={false} />);
    const offButton = screen.getByText("Off").closest("button");
    expect(offButton).toHaveClass("text-cc-primary");
  });

  it("calls onToggle(true), onSelect, and onClose when a sandbox is clicked", () => {
    render(<SandboxPickerModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev Sandbox"));
    expect(defaultProps.onToggle).toHaveBeenCalledWith(true);
    expect(defaultProps.onSelect).toHaveBeenCalledWith("dev-sandbox");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onToggle(true) and onSelect('') when Default is clicked", () => {
    render(<SandboxPickerModal {...defaultProps} selectedSandbox="dev-sandbox" />);
    fireEvent.click(screen.getByText("Default (the-companion:latest)"));
    expect(defaultProps.onToggle).toHaveBeenCalledWith(true);
    expect(defaultProps.onSelect).toHaveBeenCalledWith("");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onToggle(false) when Off is clicked", () => {
    render(<SandboxPickerModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Off"));
    expect(defaultProps.onToggle).toHaveBeenCalledWith(false);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("closes the modal when Escape is pressed", () => {
    render(<SandboxPickerModal {...defaultProps} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("closes the modal when clicking the backdrop", () => {
    render(<SandboxPickerModal {...defaultProps} />);
    const backdrop = screen.getByRole("dialog").parentElement!;
    fireEvent.click(backdrop);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the modal content", () => {
    render(<SandboxPickerModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Sandbox"));
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("closes when the close button is clicked", () => {
    render(<SandboxPickerModal {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("shows 'Manage sandboxes...' link", () => {
    render(<SandboxPickerModal {...defaultProps} />);
    const link = screen.getByText("Manage sandboxes...");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "#/sandboxes");
  });

  it("renders with no custom sandboxes (only Off and Default)", () => {
    render(<SandboxPickerModal {...defaultProps} sandboxes={[]} />);
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByText("Default (the-companion:latest)")).toBeInTheDocument();
  });

  it("passes axe accessibility checks", async () => {
    const { axe } = await import("vitest-axe");
    render(<SandboxPickerModal {...defaultProps} />);
    const results = await axe(document.body);
    expect(results).toHaveNoViolations();
  });
});
