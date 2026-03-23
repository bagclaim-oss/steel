# AGENTS.md

Repository instructions for coding agents working on The Companion.

## What this repo is

The Companion is a web UI for Claude Code and Codex. It reverse-engineers the undocumented `--sdk-url` WebSocket protocol so multiple agent sessions can be managed in the browser with streaming output, tool visibility, and permission controls.

## Agent workflow

- Work from the repository root unless a command explicitly needs `web/`.
- Prefer targeted edits and targeted tests over broad sweeps.
- Keep features compatible with both Claude Code and Codex unless the UI clearly gates an incompatible path.
- Do not delete tests without explicit user approval.
- Use `agent-browser` for browser exploration; do not add Playwright or other browser automation just to inspect the app.

## Development commands

```bash
# Install dependencies
cd web && bun install

# Foreground full-stack dev from repo root
make dev

# Foreground full-stack dev from web/
cd web && bun run dev

# Backend only (dev default port 3457)
cd web && bun run dev:api

# Frontend only (Vite on 5174)
cd web && bun run dev:vite

# Production build + serve (production default port 3456)
cd web && bun run build && bun run start

# Auth token management
cd web && bun run generate-token
cd web && bun run generate-token --force

# Landing page (always use the wrapper script)
./scripts/landing-start.sh
./scripts/landing-start.sh --stop
```

## Testing expectations

```bash
# Primary checks
cd web && bun run typecheck
cd web && bun run test

# Focused helpers
cd web && bun run test:watch
cd web && bun run test:a11y
cd web && bun run test:codex-contract
```

- All new backend code in `web/server/` and frontend code in `web/src/` should include tests when practical.
- Every new or modified frontend component in `web/src/components/` must have a companion `.test.tsx` file with:
  - a render test,
  - an axe accessibility assertion using `toHaveNoViolations()`,
  - and interaction coverage for the changed behavior.
- Server tests live beside the code they validate.
- The pre-commit hook runs `cd web && bun run typecheck && bun run test -- --coverage`; keep the tree green before committing.
- Test comments should briefly explain intent and any important edge case coverage.

## UI-specific rules

- Any UI component used in the chat/message flow must also be represented in `web/src/components/Playground.tsx`.
- If you change a message-related component such as `MessageBubble`, `ToolBlock`, `PermissionBanner`, `Composer`, streaming states, tool groups, or subagent groups, update the playground mock state too.

## Architecture map

### Data flow

```text
Browser (React) <-> WebSocket <-> Hono server (Bun) <-> WebSocket (NDJSON) <-> Claude Code CLI
     :5174            /ws/browser/:id        :3456 or :3457      /ws/cli/:id         (--sdk-url)
```

1. The browser creates a session over REST.
2. The server spawns the CLI with `--sdk-url ws://localhost:<port>/ws/cli/SESSION_ID`.
3. The CLI reconnects to the server over WebSocket using NDJSON.
4. The server bridges CLI and browser messages.
5. Tool approval flows arrive as `control_request` messages with subtype `can_use_tool`.

### Important directories

- `web/server/`
  - `index.ts` bootstraps the Bun server.
  - `ws-bridge.ts` manages session routing and protocol translation.
  - `cli-launcher.ts` owns CLI process lifecycle and resume behavior.
  - `session-store.ts` persists session metadata to `$TMPDIR/vibe-sessions/`.
  - `session-types.ts` defines protocol and session types.
  - `routes.ts` exposes the REST API.
  - `env-manager.ts` manages environment profiles in `~/.companion/envs/`.
- `web/src/`
  - `store.ts` is the Zustand state store.
  - `ws.ts` is the browser WebSocket client.
  - `api.ts` is the REST client.
  - `App.tsx` wires the shell layout and hash routing.
  - `components/` contains the UI layer, including `Playground.tsx`.
- `web/bin/cli.ts` is the published CLI entry point for `the-companion`.

## Protocol and persistence notes

- The CLI protocol is NDJSON. Common inbound message types include `system`, `assistant`, `result`, `stream_event`, `control_request`, `tool_progress`, `tool_use_summary`, and `keep_alive`.
- Full protocol notes live in `WEBSOCKET_PROTOCOL_REVERSED.md`.
- Sessions survive server restarts through `$TMPDIR/vibe-sessions/` and can be relaunched with `--resume`.

## Raw protocol recordings

The server records raw protocol traffic for both Claude Code NDJSON and Codex JSON-RPC.

- Location: `~/.companion/recordings/`
- Override directory: `COMPANION_RECORDINGS_DIR`
- Disable recording: `COMPANION_RECORD=0` or `COMPANION_RECORD=false`
- Rotation limit: `COMPANION_RECORDINGS_MAX_LINES`

Useful endpoints:

- `GET /api/recordings`
- `GET /api/sessions/:id/recording/status`
- `POST /api/sessions/:id/recording/start`
- `POST /api/sessions/:id/recording/stop`

Related code:

- `web/server/recorder.ts`
- `web/server/replay.ts`

## Pull request and issue rules

- Use commitzen-style commit messages and PR titles, for example `fix(scope): short summary`.
- Add a screenshot to the PR description for visual changes.
- Explain what changed and why in plain language.
- State whether the work was AI-generated, human-reviewed, or both.
- For Linear issues, use product-style titles instead of commitzen formatting.

## Cursor Cloud notes

- In dev, the backend default port is `3457` and the Vite frontend is `5174`.
- In production, the server default port is `3456`.
- `./scripts/dev-start.sh` is the preferred background bootstrap for cloud sessions.
- If `./scripts/dev-start.sh` times out while checking `/`, verify the backend directly with `curl http://localhost:3457/api/sessions`; the script can be tripped up by a non-2xx root response.
- Functional sessions require Claude Code CLI or Codex CLI to be installed and available. Without them, the app shell still loads and `#/playground` still works.
- No external database is required; session state is file-backed.
- Blocked `core-js` and `protobufjs` postinstalls are expected and harmless in this environment.
