import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { CompanionSandbox } from "../api.js";

interface SandboxPickerModalProps {
  sandboxes: CompanionSandbox[];
  selectedSandbox: string;
  sandboxEnabled: boolean;
  onSelect: (slug: string) => void;
  onToggle: (enabled: boolean) => void;
  onClose: () => void;
}

export function SandboxPickerModal({
  sandboxes,
  selectedSandbox,
  sandboxEnabled,
  onSelect,
  onToggle,
  onClose,
}: SandboxPickerModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Select sandbox"
        className="mx-4 w-full max-w-sm bg-cc-card border border-cc-border rounded-xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-cc-fg">Sandbox</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
            </svg>
          </button>
        </div>

        {/* Options */}
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {/* Off option */}
          <button
            onClick={() => {
              onToggle(false);
              onClose();
            }}
            className={`w-full px-3 py-2.5 text-sm text-left rounded-lg hover:bg-cc-hover transition-colors cursor-pointer flex items-center gap-2 ${
              !sandboxEnabled ? "text-cc-primary font-medium bg-cc-primary/5" : "text-cc-fg"
            }`}
          >
            <span>Off</span>
            {!sandboxEnabled && (
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 ml-auto shrink-0 text-cc-primary">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
              </svg>
            )}
          </button>

          <div className="border-t border-cc-border my-1" />

          {/* Default sandbox */}
          <button
            onClick={() => {
              onToggle(true);
              onSelect("");
              onClose();
            }}
            className={`w-full px-3 py-2.5 text-sm text-left rounded-lg hover:bg-cc-hover transition-colors cursor-pointer flex items-center gap-2 ${
              sandboxEnabled && !selectedSandbox ? "text-cc-primary font-medium bg-cc-primary/5" : "text-cc-fg"
            }`}
          >
            <span className="truncate">Default (the-companion:latest)</span>
            {sandboxEnabled && !selectedSandbox && (
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 ml-auto shrink-0 text-cc-primary">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
              </svg>
            )}
          </button>

          {/* Custom sandboxes */}
          {sandboxes.map((sb) => (
            <button
              key={sb.slug}
              onClick={() => {
                onToggle(true);
                onSelect(sb.slug);
                onClose();
              }}
              className={`w-full px-3 py-2.5 text-sm text-left rounded-lg hover:bg-cc-hover transition-colors cursor-pointer flex items-center gap-2 ${
                sandboxEnabled && sb.slug === selectedSandbox ? "text-cc-primary font-medium bg-cc-primary/5" : "text-cc-fg"
              }`}
            >
              <span className="truncate">{sb.name}</span>
              {sb.imageTag && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 shrink-0">custom</span>
              )}
              {sandboxEnabled && sb.slug === selectedSandbox && (
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 ml-auto shrink-0 text-cc-primary">
                  <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                </svg>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-cc-border mt-3 pt-3">
          <a
            href="#/sandboxes"
            onClick={onClose}
            className="block text-xs text-cc-muted hover:text-cc-fg transition-colors"
          >
            Manage sandboxes...
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
