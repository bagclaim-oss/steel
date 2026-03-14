export interface QuickTerminalTab {
  id: string;
  label: string;
  cwd: string;
  containerId?: string;
}

export type QuickTerminalPlacement = "top" | "right" | "bottom" | "left";

export type DiffBase = "last-commit" | "default-branch";
