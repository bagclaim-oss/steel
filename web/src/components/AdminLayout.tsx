import { useMemo, useSyncExternalStore } from "react";
import { useStore } from "../store.js";
import { parseHash } from "../utils/routing.js";
import { NAV_ITEMS, EXTERNAL_LINKS } from "./SidebarMenu.js";

/**
 * Persistent navigation wrapper for admin pages (Settings, Prompts, etc.).
 * Shows a left sidebar nav on desktop and a horizontal tab bar on mobile.
 */
export function AdminLayout({ children }: { children: React.ReactNode }) {
  const hash = useSyncExternalStore(
    (cb) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); },
    () => window.location.hash,
  );
  const route = useMemo(() => parseHash(hash), [hash]);

  const handleNav = (itemHash: string, itemId: string) => {
    if (itemId !== "terminal") {
      useStore.getState().closeTerminal();
    }
    window.location.hash = itemHash;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Mobile: horizontal scrollable tab bar */}
      <nav className="sm:hidden shrink-0 border-b border-cc-border bg-cc-sidebar overflow-x-auto" aria-label="Admin pages">
        <div className="flex gap-0.5 px-3 py-1.5 min-w-max">
          <button
            onClick={() => { window.location.hash = "#/"; }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-cc-muted hover:text-cc-fg rounded-md hover:bg-cc-hover transition-colors cursor-pointer whitespace-nowrap"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M7.78 1.97a.75.75 0 00-1.06 0l-5.25 5.25a.75.75 0 000 1.06l.5.5a.75.75 0 001.06 0L3 8.81V13.5A1.5 1.5 0 004.5 15h7a1.5 1.5 0 001.5-1.5V8.81l-.03.03a.75.75 0 001.06 0l.5-.5a.75.75 0 000-1.06L7.78 1.97z" />
            </svg>
            Sessions
          </button>
          {NAV_ITEMS.map((item) => {
            const isActive = item.activePages
              ? item.activePages.some((p) => route.page === p)
              : route.page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.hash, item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`px-2.5 py-1.5 text-[11px] rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? "text-cc-primary bg-cc-primary/10 font-medium"
                    : "text-cc-muted hover:text-cc-fg hover:bg-cc-hover"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Desktop: sidebar + content */}
      <div className="flex-1 min-h-0 flex">
        <nav className="hidden sm:flex flex-col w-44 shrink-0 border-r border-cc-border bg-cc-sidebar overflow-y-auto" aria-label="Admin navigation">
          <div className="px-2 pt-3 pb-2">
            <button
              onClick={() => { window.location.hash = "#/"; }}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-[12px] text-cc-muted hover:text-cc-fg rounded-md hover:bg-cc-hover transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                <path d="M7.78 1.97a.75.75 0 010 1.06L4.81 6h8.69a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z" />
              </svg>
              <span className="font-medium">Sessions</span>
            </button>
          </div>

          <div className="px-2 flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const isActive = item.activePages
                ? item.activePages.some((p) => route.page === p)
                : route.page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.hash, item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left text-[12px] rounded-md transition-colors cursor-pointer ${
                    isActive
                      ? "text-cc-fg bg-cc-active font-medium"
                      : "text-cc-muted hover:text-cc-fg hover:bg-cc-hover"
                  }`}
                >
                  <svg viewBox={item.viewBox} fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                    <path d={item.iconPath} fillRule={item.fillRule} clipRule={item.clipRule} />
                  </svg>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* External links */}
          <div className="mt-auto px-2 pb-3 pt-2 border-t border-cc-border/50">
            {EXTERNAL_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left text-[11px] text-cc-muted hover:text-cc-fg hover:bg-cc-hover rounded-md transition-colors"
              >
                <svg viewBox={link.viewBox} fill="currentColor" className="w-3 h-3 shrink-0">
                  <path d={link.iconPath} />
                </svg>
                <span>{link.label}</span>
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5 ml-auto opacity-40">
                  <path d="M8.636 3.5a.5.5 0 00-.5-.5H1.5A1.5 1.5 0 000 4.5v10A1.5 1.5 0 001.5 16h10a1.5 1.5 0 001.5-1.5V7.864a.5.5 0 00-1 0V14.5a.5.5 0 01-.5.5h-10a.5.5 0 01-.5-.5v-10a.5.5 0 01.5-.5h6.636a.5.5 0 00.5-.5z" />
                  <path d="M16 .5a.5.5 0 00-.5-.5h-5a.5.5 0 000 1h3.793L6.146 9.146a.5.5 0 10.708.708L15 1.707V5.5a.5.5 0 001 0v-5z" />
                </svg>
              </a>
            ))}
          </div>
        </nav>

        {/* Page content */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
