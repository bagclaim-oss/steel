import type { SavedPrompt } from "../api.js";

interface MentionMenuProps {
  open: boolean;
  loading: boolean;
  prompts: SavedPrompt[];
  selectedIndex: number;
  onSelect: (prompt: SavedPrompt) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

export function MentionMenu({
  open,
  loading,
  prompts,
  selectedIndex,
  onSelect,
  menuRef,
  className = "",
}: MentionMenuProps) {
  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className={`max-h-[260px] overflow-y-auto bg-cc-card border border-cc-border rounded-[18px] shadow-[0_22px_56px_rgba(15,23,42,0.18)] z-20 py-2 ${className}`}
    >
      {loading ? (
        <div className="px-4 py-3 text-[12px] text-cc-muted">
          Searching prompts...
        </div>
      ) : prompts.length > 0 ? (
        prompts.map((prompt, i) => (
          <button
            key={prompt.id}
            data-prompt-index={i}
            onClick={() => onSelect(prompt)}
            className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors cursor-pointer ${
              i === selectedIndex
                ? "bg-cc-hover"
                : "hover:bg-cc-hover/50"
            }`}
          >
            <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-cc-hover text-cc-muted shrink-0">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                <path d="M2.5 8a5.5 5.5 0 1111 0v3a2.5 2.5 0 01-2.5 2.5h-1" strokeLinecap="round" />
                <circle cx="8" cy="8" r="1.75" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-cc-fg truncate">@{prompt.name}</div>
              <div className="text-[11px] text-cc-muted truncate">{prompt.content}</div>
            </div>
            <span className="rounded-full border border-cc-border bg-cc-bg/55 px-2 py-0.5 text-[10px] text-cc-muted shrink-0">{prompt.scope}</span>
          </button>
        ))
      ) : (
        <div className="px-4 py-3 text-[12px] text-cc-muted">
          No prompts found.
        </div>
      )}
    </div>
  );
}
