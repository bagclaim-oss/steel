// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── Store mock ──────────────────────────────────────────────────────────────

const mockState = {
  closeTerminal: vi.fn(),
  setSidebarOpen: vi.fn(),
};

vi.mock("../store.js", () => {
  const useStoreFn = (selector: (state: typeof mockState) => unknown) => {
    return selector(mockState);
  };
  useStoreFn.getState = () => mockState;
  return { useStore: useStoreFn };
});

vi.mock("../utils/routing.js", () => ({
  parseHash: (hash: string) => {
    const stripped = hash.replace("#/", "") || "home";
    // Handle sub-routes like "integrations/linear"
    if (stripped === "integrations/linear") return { page: "integration-linear", sessionId: null };
    if (stripped === "integrations/tailscale") return { page: "integration-tailscale", sessionId: null };
    if (stripped.startsWith("agents/")) return { page: "agent-detail", agentId: stripped.split("/")[1], sessionId: null };
    return { page: stripped, sessionId: null };
  },
}));

// ─── Import component after mocks ────────────────────────────────────────────

import { AdminLayout } from "./AdminLayout.js";
import { NAV_ITEMS, EXTERNAL_LINKS } from "./SidebarMenu.js";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AdminLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "#/settings";
  });

  it("renders all navigation items", () => {
    // Verifies that every NAV_ITEMS entry appears in the admin navigation.
    render(<AdminLayout><div>Content</div></AdminLayout>);
    for (const item of NAV_ITEMS) {
      // Desktop nav shows labels; use getAllByText since mobile also renders them
      const elements = screen.getAllByText(item.label);
      expect(elements.length).toBeGreaterThan(0);
    }
  });

  it("renders children content", () => {
    // Verifies that the children prop is rendered inside the layout.
    render(<AdminLayout><div data-testid="child-content">Hello World</div></AdminLayout>);
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("renders 'Sessions' back link", () => {
    // Verifies the "Sessions" back navigation is present.
    render(<AdminLayout><div>Content</div></AdminLayout>);
    const backLinks = screen.getAllByText("Sessions");
    expect(backLinks.length).toBeGreaterThan(0);
  });

  it("highlights the active navigation item", () => {
    // Verifies that the active page has aria-current="page" set.
    window.location.hash = "#/settings";
    render(<AdminLayout><div>Content</div></AdminLayout>);
    const settingsButtons = screen.getAllByText("Settings");
    // At least one should have aria-current="page"
    const activeButton = settingsButtons.find(
      (el) => el.closest("[aria-current='page']") !== null
    );
    expect(activeButton).toBeDefined();
  });

  it("navigates when a nav item is clicked", () => {
    // Verifies clicking a nav item changes the hash route.
    window.location.hash = "#/settings";
    render(<AdminLayout><div>Content</div></AdminLayout>);
    // Click "Prompts" in the desktop nav
    const promptsButtons = screen.getAllByText("Prompts");
    fireEvent.click(promptsButtons[0]);
    expect(window.location.hash).toBe("#/prompts");
  });

  it("navigates to home when 'Sessions' is clicked", () => {
    // Verifies clicking "Sessions" back link navigates to home.
    window.location.hash = "#/settings";
    render(<AdminLayout><div>Content</div></AdminLayout>);
    const backLinks = screen.getAllByText("Sessions");
    fireEvent.click(backLinks[0]);
    expect(window.location.hash).toBe("#/");
  });

  it("renders external links with secure attributes", () => {
    // Verifies external links have target="_blank" and rel="noopener noreferrer".
    render(<AdminLayout><div>Content</div></AdminLayout>);
    for (const link of EXTERNAL_LINKS) {
      const el = screen.getByText(link.label).closest("a");
      expect(el).toHaveAttribute("target", "_blank");
      expect(el).toHaveAttribute("rel", "noopener noreferrer");
      expect(el).toHaveAttribute("href", link.url);
    }
  });

  it("has admin navigation landmarks", () => {
    // Verifies the nav elements have proper aria-labels for accessibility.
    render(<AdminLayout><div>Content</div></AdminLayout>);
    // Mobile nav ("Admin pages") + Desktop nav ("Admin navigation")
    expect(screen.getByRole("navigation", { name: "Admin pages" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Admin navigation" })).toBeInTheDocument();
  });

  it("passes axe accessibility checks", async () => {
    // Verifies the component meets WCAG accessibility standards.
    const { axe } = await import("vitest-axe");
    const { container } = render(<AdminLayout><div>Content</div></AdminLayout>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
