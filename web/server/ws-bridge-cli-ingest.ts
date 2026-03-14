import type { CLIMessage } from "./session-types.js";

// ─── CLI Ingest Pipeline ────────────────────────────────────────────────────
// Pure functions for parsing and deduplicating CLI (NDJSON) messages.
// Extracted from WsBridge.handleCLIMessage to enable isolated testing
// of reconnect/replay deduplication scenarios.

/** State needed for CLI message deduplication. Matches a subset of Session. */
export interface CLIDedupState {
  recentCLIMessageHashes: string[];
  recentCLIMessageHashSet: Set<string>;
}

/**
 * Parse raw NDJSON data into individual line strings.
 * Splits on newlines and filters blank lines.
 */
export function parseNDJSON(raw: string | Buffer): string[] {
  const data = typeof raw === "string" ? raw : raw.toString("utf-8");
  return data.split("\n").filter((l) => l.trim());
}

/**
 * Check if a CLI message is a duplicate based on a rolling hash window.
 * On WS reconnect, the CLI replays in-flight messages; this dedup prevents
 * duplicates from reaching downstream handlers.
 *
 * - `assistant`, `result`, `system` messages: deduped by content hash (Bun.hash)
 * - `stream_event` messages: deduped by their stable `uuid` field
 * - All other types (keep_alive, control_request, tool_progress, etc.): never deduped
 *
 * Returns true if the message is a duplicate and should be skipped.
 * Mutates the dedupState window as a side effect.
 */
export function isDuplicateCLIMessage(
  msg: CLIMessage,
  rawLine: string,
  state: CLIDedupState,
  windowSize: number,
): boolean {
  if (msg.type === "assistant" || msg.type === "result" || msg.type === "system") {
    const hash = Bun.hash(rawLine).toString(36);
    if (state.recentCLIMessageHashSet.has(hash)) {
      return true;
    }
    state.recentCLIMessageHashes.push(hash);
    state.recentCLIMessageHashSet.add(hash);
    while (state.recentCLIMessageHashes.length > windowSize) {
      const old = state.recentCLIMessageHashes.shift()!;
      state.recentCLIMessageHashSet.delete(old);
    }
    return false;
  }

  if (msg.type === "stream_event" && (msg as { uuid?: string }).uuid) {
    const uuid = (msg as { uuid: string }).uuid;
    if (state.recentCLIMessageHashSet.has(uuid)) {
      return true;
    }
    state.recentCLIMessageHashes.push(uuid);
    state.recentCLIMessageHashSet.add(uuid);
    while (state.recentCLIMessageHashes.length > windowSize) {
      const old = state.recentCLIMessageHashes.shift()!;
      state.recentCLIMessageHashSet.delete(old);
    }
    return false;
  }

  // All other message types are never considered duplicates
  return false;
}
