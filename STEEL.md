# Steel — Agent Context

<!-- STEEL_MD_SCHEMA: v1 -->
<!-- This file is the agent's persistent memory. Humans and agents both edit it. -->

> **If you're a human reading this:** STEEL.md is the living spec for Steel and the operating manual for any AI agent working on this repo. It's meant to be read top-to-bottom once to understand the project, then referenced by section. The agent reads it at the start of every session and updates it at the end of every session. Skip to [What Steel Is](#what-steel-is) for the product overview, or [Current State](#current-state) for what's built.
>
> **If you're an agent reading this:** follow the Agent Protocol below. Every time. No exceptions.

> ## ⚠️ AGENT PROTOCOL — READ BEFORE EVERY TASK
>
> **The Loop:**
> 1. **READ** this entire file first. It is your memory across sessions.
> 2. **PLAN** — outline what you'll touch before writing code. Identify the Self-Modification Tier.
> 3. **BUILD** on a feature branch, in small commits.
> 4. **VERIFY** — run `bun run typecheck`, `bun run build`, and the smoke test (see Verification).
> 5. **UPDATE** STEEL.md — File Map, Current State, Session Log.
> 6. **COMMIT** the STEEL.md update as the final commit of the task.
>
> **Hard rules:** Never skip step 5. Never work directly on `main` except for Tier 1 changes (see [Self-Modification Tiers](#self-modification-tiers)). Never commit secrets.
>
> **Definition of done:** All Loop steps complete, PR opened, smoke test passing, STEEL.md updated. A task is not done until STEEL.md reflects reality.
>
> **Note:** "The Loop" (above) and "Self-Build Protocol" (later in file) describe the same flow at different granularity — The Loop is the summary, Self-Build Protocol is the detailed version. When they appear to conflict, Self-Build Protocol wins.

---

## Table of Contents

- [What Steel Is](#what-steel-is)
- [CLAUDE.md Relationship](#claudemd-relationship)
- [Getting Started](#getting-started-for-the-agents-first-session)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Security Model](#security-model)
- [Performance Budget](#performance-budget)
- [First-Run Experience](#first-run-experience)
- [MCP & Extensibility](#mcp--extensibility)
- [Model Support](#model-support)
- [Diagnostics (the telemetry paradox)](#diagnostics-the-telemetry-paradox)
- [Testing Strategy](#testing-strategy)
- [Design Principles](#design-principles)
- [Release Strategy](#release-strategy)
- [Contribution Model](#contribution-model)
- [What a Great Steel Session Looks Like](#what-a-great-steel-session-looks-like)
- [Current State](#current-state)
- [File Map](#file-map)
- [Conventions](#conventions)
- [Verification](#verification)
- [Active Issues](#active-issues)
- [Session Log](#session-log)
- [Self-Build Protocol](#self-build-protocol)
- [Self-Modification Tiers](#self-modification-tiers)
- [Escape Hatch](#escape-hatch)
- [Do Not](#do-not)

---

## What Steel Is

Steel is an open-source, self-hosted agentic coding environment. It's a web-based IDE that drives the Claude Code CLI through its WebSocket interface, giving users a Cursor-like experience that runs on their existing Claude Code subscription.

### Why Steel exists

Cursor, Windsurf, and Codex are closed cloud products with escalating pricing, telemetry, and vendor lock-in. Claude Code is powerful but terminal-only. Steel is the missing third option: **a real IDE you own end-to-end, with the agent loop of Claude Code and the editor ergonomics of Cursor.**

### Differentiation (the actual moat)

1. **You own the data plane.** Every byte stays on your machine. No code snippets leak to a SaaS. This is non-negotiable for regulated industries, serious IP work, and anyone who's been burned by a service changing terms.
2. **Runs on the subscription you already pay for.** No seat pricing, no per-token charges, no surprise bills. The CLI subscription is the only cost.
3. **Agent-native from day one.** Cursor retrofitted agents onto a fork of VS Code. Steel is built around the agent loop — multi-session, tool approval UI, worktree isolation are first-class.
4. **Self-improving.** Steel can build itself. The STEEL.md living-context pattern means features ship by asking the agent to ship them. This compounds.
5. **Forkable and fork-friendly.** MIT license, clean separation between protocol/bridge/UI layers, documented extension points. If Steel dies, you keep running.

### Non-goals (what Steel is NOT)

- **Not a VS Code replacement.** Steel is an agent-first environment. Heavy manual editing is fine but isn't the focus — that's what VS Code is already great at.
- **Not a cloud product.** No hosted version, no accounts, no "Steel Cloud" tier. Local-first forever.
- **Not a multi-provider abstraction (yet).** Steel is Claude-native. Support for other models comes only if it doesn't compromise the core experience.
- **Not an enterprise SaaS.** No SSO integration, no admin dashboards, no seat management. Teams that want those things should fork and build them.
- **Not a plugin marketplace.** Extensibility via MCP servers and config, not a proprietary plugin API.

### Core philosophy

The user owns the entire stack. Steel is a local-first tool that builds and improves itself over time. When a feature decision trades off between "user freedom" and "product polish," choose freedom.

---

## CLAUDE.md Relationship

Claude Code automatically reads `CLAUDE.md` at the repo root as context. Steel uses the same file pattern but names it `STEEL.md` for project identity.

**Setup:** The repo contains a `CLAUDE.md` that is a symlink to `STEEL.md`:

```bash
ln -s STEEL.md CLAUDE.md
```

This ensures Claude Code picks it up automatically while keeping the Steel-branded canonical file. Do not edit `CLAUDE.md` directly — edit `STEEL.md`.

---

## Getting Started (for the agent's first session)

### Bootstrap (one-time, if repo is a fresh fork)

1. Confirm base: `git remote -v` should show the companion fork as `origin`
2. Add upstream: `git remote add upstream https://github.com/The-Vibe-Company/companion.git`
3. Install: `bun install`
4. Verify companion baseline works: `bun run dev`, open `localhost:5174`, spawn a session, send a prompt
5. Only after baseline is confirmed working, begin Phase 0 tasks

The Phase 0 rename is the exception to the "always use a feature branch" rule — do it on `main` as a single bootstrap commit, then enforce feature-branch discipline for everything after.

### Everyday commands

- `bun install` — install deps
- `bun run dev` — dev server with HMR (server on :3456, Vite HMR proxy on :5174 — open **5174** in dev)
- `bun run build` — production build
- `bun run start` — run production build (everything served from :3456 — open **3456** in prod)
- `bun run typecheck` — TypeScript check
- `bun run lint` — lint
- `bun run test` — run tests (add if missing)

**Port rule:** In dev, open `localhost:5174`. In prod / `bunx steel`, open `localhost:3456`. The server always runs on :3456; Vite's HMR proxy only exists in dev mode.

### Required `.gitignore` entries

Steel stores user config and logs in `~/.steel/` (outside the repo, not a concern), but the repo itself must ignore:

```
node_modules/
dist/
.env
.env.local
*.log
.steel-local/     # if any per-repo state ever lands, it goes here and is ignored
```

If you see an uncommitted file that looks like state / logs / secrets, verify `.gitignore` covers it before any commit.

---

## Architecture

```
                                    ┌────────────────────┐
                                    │   Browser (React)  │
                                    │  ┌──────────────┐  │
                                    │  │ Monaco       │  │
                                    │  │ FileTree     │  │
                                    │  │ ChatPanel    │  │
                                    │  │ Composer     │  │
                                    │  └──────────────┘  │
                                    └─────────┬──────────┘
                                              │
                                      JSON WebSocket
                                    (auth: bearer token)
                                              │
        ┌─────────────────────────────────────┴────────────────────────────────┐
        │                     Steel Server (Bun + Hono)                        │
        │  ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
        │  │ WS Bridge│ │ Session    │ │ Auth     │ │ SafePath │ │ Diag log │  │
        │  │          │ │ Manager    │ │          │ │ Sandbox  │ │          │  │
        │  └────┬─────┘ └─────┬──────┘ └──────────┘ └──────────┘ └──────────┘  │
        └───────┼─────────────┼──────────────────────────────────────────────┘
                │             │
     NDJSON WS  │             │ spawn(claude --sdk-url=...)
                │             │
        ┌───────┴─────────────┴───────┐       ┌──────────────────┐
        │     Claude Code CLI         │──────▶│   MCP Servers    │
        │   (one process per session) │       │ (configurable)   │
        └──────────────┬──────────────┘       └──────────────────┘
                       │
                       │ reads/writes (scoped to project root)
                       ▼
                ┌─────────────┐
                │  User files │
                └─────────────┘
```

**Flow:**
- Browser authenticates with bearer token, opens WebSocket to Steel server
- User prompt flows: Browser → WS Bridge → spawned CLI process
- CLI streams NDJSON responses back through WS Bridge → Browser (re-encoded as JSON)
- Tool approval: CLI → WS Bridge → Browser → user → back through WS Bridge → CLI
- File operations go through SafePath sandbox (refuses `../` and symlink escapes)
- Errors / anomalies written to local diagnostics log (never transmitted)
- MCP servers configured in `~/.steel/mcp.json`, spawned and managed by the CLI itself

---

## Tech Stack

| Layer     | Technology                           | Why                                                     |
| --------- | ------------------------------------ | ------------------------------------------------------- |
| Runtime   | Bun                                  | Fast cold boot, native WS, single binary, bundles `bunx` distribution |
| Server    | Hono + native Bun WebSocket          | Minimal, portable, zero-config; Hono works across runtimes if we ever need to move |
| Frontend  | React 19 + TypeScript                | Concurrent rendering helps streaming UIs; industry-default ecosystem |
| Editor    | Monaco (VS Code's editor)            | The only editor users accept for serious work           |
| State     | Zustand                              | Minimal ceremony, no provider tree, works well with WS streams |
| Styling   | Tailwind CSS v4                      | Fast iteration, no CSS files to manage, easy for the agent to read |
| Build     | Vite                                 | Fast HMR, mature, Monaco-friendly                       |

**Do not replace a stack component** without going through Self-Modification Tier 4.

---

## Security Model

Steel is a local server that spawns processes, reads/writes files, and opens WebSocket ports. That is a real attack surface. Treat it accordingly.

### Threat model

- **Primary user:** developer running Steel on their own machine
- **Trust boundary:** the machine itself. Anyone with network access to the Steel port can potentially control Claude Code sessions.
- **Adversaries:**
  - Malicious websites in the user's browser (CSRF, DNS rebinding)
  - Other processes on the user's machine
  - Network peers on shared LANs / coffee shops / coworking spaces
  - Supply chain (malicious deps)

### Defaults

- Bind to `127.0.0.1` only. LAN exposure is opt-in via explicit config flag (`STEEL_HOST=0.0.0.0`).
- Require a bearer token (`STEEL_AUTH_TOKEN`) for any non-loopback request. Auto-generated on first run, stored in `~/.steel/auth.token` with `0600` perms.
- CORS: allow only the configured Steel origin. No wildcards.
- WebSocket origin check: reject connections from origins not on an allowlist.
- Never log auth tokens, prompts, or file contents to disk by default.
- File operations performed by the agent are scoped to the user-selected project directory — the server must refuse path traversal (`../`) and symlink escapes.

### Hardening rules

- Any new endpoint must require auth by default — opt out requires a comment explaining why.
- Any new file operation must go through the project-root sandbox helper (`server/safe-path.ts`).
- Any new dep added to `package.json` must be justified in the Session Log. Prefer zero-dep solutions.
- Never `eval`, never `Function()`, never shell out with unescaped user input.

---

## Performance Budget

An editor feels bad at 100ms latency. Steel must respect the same bar Cursor does.

### Targets

| Action                                     | Budget   | Measured where               |
| ------------------------------------------ | -------- | ---------------------------- |
| Keystroke to render in editor              | < 16ms   | Monaco internal              |
| Prompt submit to first streamed token      | < 500ms  | Browser WS receive timestamp |
| Tool approval prompt to UI render          | < 50ms   | Server dispatch to paint     |
| File tree render for 10k files             | < 200ms  | Initial mount                |
| Session switch                             | < 100ms  | Tab click to paint           |
| Cold boot (`bunx steel` to browser usable) | < 3s     | CLI start to `GET /` 200     |

### Rules

- Any PR that regresses one of these budgets by more than 10% must be called out in the PR body and approved explicitly.
- Do not ship features that block the main thread for more than 50ms.
- Virtualize any list that can exceed 500 rows (file tree, chat history, session list).
- Lazy-load Monaco languages. Never bundle all of them.
- Measure before optimizing. No speculative perf work.

---

## First-Run Experience

The first 60 seconds decide whether a user adopts Steel. Protect them.

### The ideal first run

1. User runs `bunx steel`
2. Terminal prints: `Steel is running at http://localhost:3456 — opening browser...`
3. Browser opens to a welcome screen
4. Welcome screen checks prerequisites (Claude Code CLI installed? authenticated?) with clear pass/fail indicators
5. If checks pass, one button: **"Start coding"** → opens project picker
6. User selects a folder, Steel spawns the first session, ready to prompt

### Rules

- Never require configuration before the first successful interaction.
- All errors on the welcome screen must include a one-click fix or a copy-paste command to resolve.
- If Claude Code CLI is missing, link to its install page. Do not try to auto-install.
- First-run onboarding must complete in under 90 seconds with a fresh install.
- The welcome screen only appears once per machine (tracked by file in `~/.steel/`, not cookie).

---

## MCP & Extensibility

Steel's only extensibility contract is [MCP (Model Context Protocol)](https://modelcontextprotocol.io). No proprietary plugin API, ever.

### What this means

- Users configure MCP servers in `~/.steel/mcp.json` (same schema as Claude Desktop for familiarity)
- Steel forwards MCP config to the CLI on session spawn
- Tool calls originating from MCP servers appear in the UI like any other tool call
- UI surfaces MCP server status (connected / error / disabled) in session settings

### Why this bound matters

Proprietary plugin APIs create lock-in and fragmentation. By deferring to MCP, Steel stays composable with the broader ecosystem (Claude Desktop, Claude Code, and any other MCP-aware client). Extensions written for Steel work elsewhere. Extensions written elsewhere work in Steel.

### Rule

Before adding any in-Steel extension mechanism (slash commands, custom tool UIs, etc.), ask: can this be expressed as an MCP server instead? If yes, do that.

---

## Model Support

Steel is **Claude-native**. This is a deliberate constraint.

### Current: Claude via Claude Code CLI

The CLI handles model selection (`--model` flag), authentication, and tool calling. Steel is a UI layer over it. Any model the CLI supports, Steel supports.

### Future: other providers

Only considered if:
1. The core Claude experience is not degraded
2. The other provider has a stable agent-loop CLI or SDK that matches Claude Code's capabilities (tool use, streaming, permission hooks)
3. There's clear user demand, not speculative feature parity

Do not build provider abstractions speculatively. Every abstraction has a cost.

---

## Diagnostics (the telemetry paradox)

Steel has a no-telemetry guarantee. But the agent still needs a way to debug when things break.

### The solution: local-only diagnostics

- Errors, protocol anomalies, and perf violations are logged to `~/.steel/logs/` with daily rotation
- Logs contain timestamps, error messages, and redacted context (no prompts, no file contents, no auth tokens)
- A `bunx steel diagnose` command packages recent logs + versions into a single file the user can manually share when filing a bug
- Nothing is ever sent anywhere without an explicit user action

### Rule

If the agent adds a new error path, it must log to the local diagnostics file. If the agent adds a metric, it stays local. No exceptions.

---

## Testing Strategy

Editors without tests ship regressions. Here's what Steel tests and how.

### Tiers

1. **Unit tests** — pure logic (protocol parsing, path sandboxing, state reducers). Fast, many.
2. **Integration tests** — server endpoints with a mock CLI process. Verify WS bridge, auth, session lifecycle.
3. **End-to-end smoke** — the Verification smoke test, automated with Playwright once the UI is stable.
4. **Manual regression checklist** — a markdown file in `test/manual/` that humans run before each release.

### What must have tests

- `server/protocol.ts` — every NDJSON message type, round-trip
- `server/safe-path.ts` — path traversal resistance
- `server/auth.ts` — token validation
- `server/session-manager.ts` — spawn, kill, resume, crash recovery
- Any bug fix — add a regression test so it can't come back

### What doesn't need tests

- Pure styling / layout
- Trivial glue code
- Experimental prototypes in `ui/components/playground/`

### Rule

A bug fix without a regression test is not a bug fix. It's a guess.

---

## Design Principles

Steel is an agent-native IDE. Every UI decision is measured against these principles. When they conflict, earlier principles win.

### 1. The agent is the interface
The chat panel is not a sidebar feature — it's the primary input method. Every UI element should feel like it supports the agent loop, not compete with it.

### 2. Everything is keyboard-reachable
No feature ships without a keyboard shortcut. Power users should never need the mouse. Discoverability comes from the command palette, not from buttons.

### 3. Latency is a feature
A 50ms delay is a bug. Streaming responses should render token-by-token without jitter. Tool approvals should appear instantly.

### 4. Destructive actions require friction
File writes, deletions, commits, branch operations — all must show a diff or confirmation. "Undo" should be reachable within 1 click or 1 keystroke for 30 seconds after any destructive action.

### 5. Show what the agent is doing
Black-box tool calls are unacceptable. Every Bash command, file read, search, and edit must be visible in collapsible blocks with syntax highlighting. If the user wants to approve blind, they can — but they should never be forced to.

### 6. Respect the user's existing muscle memory
Cursor, VS Code, JetBrains, and vim users should feel some familiarity. Don't invent new keybindings for actions that already have conventional ones.

### 7. Local-first, offline-capable where possible
Steel should do everything useful even with no internet, assuming the CLI has cached state. Syntax highlighting, editing, git ops, diff viewing: all offline.

### 8. No dark patterns, ever
No "are you sure you want to leave?" modals. No "recommend to a friend" nags. No upsells (there's nothing to upsell). If a user wants to quit, let them.

---

## Release Strategy

### Versioning
- Semver (`MAJOR.MINOR.PATCH`)
- Preview builds use `MAJOR.MINOR.PATCH-preview.N` (e.g., `0.3.1-preview.2`)
- Breaking changes bump MAJOR (but pre-1.0, MINOR bumps can break — document loudly in CHANGELOG)

### Channels
- **Stable** (default): tagged semver releases, published to npm
- **Preview**: tagged preview builds, opt-in via Settings → Updates
- Switching channels takes effect on next update check

### Release cadence
- No fixed schedule. Ship when ready, not when the calendar says.
- A release must pass: `bun run typecheck`, `bun run lint`, `bun run build`, `bun run test`, and the smoke test.
- CHANGELOG.md is generated from conventional commit messages.

### Distribution
- Primary: `bunx steel` (zero-install)
- Secondary: `npm i -g steel`
- Future: Homebrew, Docker image

---

## Contribution Model

Steel is currently solo-maintained. That will change if traction warrants it.

### Current (solo)
- The maintainer is the agent's user. "Open a PR" in the Self-Build Protocol means: open a PR against the maintainer's fork, self-review the diff in the browser, merge.
- Direct commits to `main` still prohibited — the PR loop exists so the maintainer (and future reviewers) can audit the agent's work.

### Future (if contributors arrive)
- External PRs must: pass CI, add tests for bug fixes, update STEEL.md if architecture changes, follow conventional commits.
- Maintainer has final say on scope — "not a goal" PRs get closed with pointers to the non-goals list.
- Contributors who ship quality PRs can become committers.

---

## What a Great Steel Session Looks Like

Concrete example, so the agent knows the shape of good work.

**User prompt:** _"Add an inline edit feature — select code, hit cmd+K, describe a change, get a diff inline."_

**Good agent flow:**

1. **Reads STEEL.md first.** Notes this is a Phase 2 item, Tier 3 (new top-level feature).
2. **Asks a single clarifying question:** "Should the inline diff reuse DiffViewer.tsx or be a new lightweight component? Cursor uses a ghost-text pattern — match that?"
3. **After user answers, writes a short plan:**
   > Plan: New `InlineEdit.tsx` component. Monaco decoration API for ghost text. New WS message type `inline_edit_request` / `inline_edit_response`. Keybinding registered in command palette. Estimated 4 files touched, 1 new component, no new deps. No protocol layer changes.
4. **User approves plan.**
5. **Creates branch** `feat/inline-edit`.
6. **Commits in 4 small steps:** scaffold component, wire keybinding, wire WS round-trip, polish.
7. **Runs Verification.** Typecheck passes, smoke test passes, manually tests inline edit works end-to-end.
8. **Updates STEEL.md:** checks the Phase 2 item, adds `InlineEdit.tsx` to File Map, adds Session Log entry.
9. **Final commit** = STEEL.md update.
10. **Opens PR** with title `feat: inline edit (cmd+K)` and body describing behavior + manual test steps.

**What makes it good:**
- One clarifying question, not five
- Plan before code
- Small commits, each working
- STEEL.md updated as part of the task, not after
- No scope creep (didn't also refactor DiffViewer "while I'm in there")

---

### Counter-example: what a BAD Steel session looks like

Same prompt: _"Add an inline edit feature — select code, hit cmd+K, describe a change, get a diff inline."_

**Bad agent flow (do NOT do this):**

1. ❌ Doesn't read STEEL.md — assumes conventions from memory
2. ❌ Starts writing code immediately on `main`
3. ❌ Creates a new file `src/components/inline-edit.tsx` (wrong folder, wrong casing)
4. ❌ "While I'm here, let me also refactor DiffViewer" — scope creep
5. ❌ Adds three new dependencies without justification (`react-select`, `lodash`, `moment`)
6. ❌ Writes a 600-line mega-commit with no test
7. ❌ When typecheck fails, adds `// @ts-ignore` in 12 places
8. ❌ Doesn't run the smoke test
9. ❌ Pushes directly, no PR
10. ❌ Doesn't update STEEL.md

**What's wrong at each step:**
- Step 1: STEEL.md is your memory. Without it you're guessing.
- Step 2: Main branch is sacred. Feature branches always.
- Step 3: File naming conventions exist in Conventions section. Read them.
- Step 4: Scope creep turns a 1-hour task into a 1-day task and hides bugs in large diffs.
- Step 5: Every dep is a supply-chain risk. `moment` is deprecated; `lodash` is bundler bloat; `react-select` is a 200KB import for something Monaco handles natively.
- Step 6: Large commits can't be reverted cleanly. Small commits can.
- Step 7: `@ts-ignore` is technical debt masquerading as progress. Fix the type or ask.
- Step 8: Shipping without smoke testing is how editors break silently in production.
- Step 9: No PR = no audit trail. The user should be able to review what the agent did.
- Step 10: STEEL.md stale means the NEXT session will be worse. The cost compounds.

**Lesson:** The rules in this file are not bureaucracy. They're what keeps a self-improving codebase from drifting into chaos.

---

## Current State

_Last updated: 2026-04-17_

### Phase 0 — Bootstrap (fork from companion)
- [ ] Fork `The-Vibe-Company/companion` as the base
- [ ] Rename package to `steel`, update all identifiers
- [ ] Rename config dir from `~/.steel/` to `~/.steel/`
- [ ] Strip companion branding from UI
- [ ] Set up `CLAUDE.md → STEEL.md` symlink
- [ ] Verify existing functionality still works post-rename

### Phase 1 — Core IDE (foundation to feel like a real editor)
- [ ] Monaco editor in center panel
- [ ] File tree with live dirty-state indicators and search
- [ ] Multi-file tab bar in editor with close / reorder
- [ ] Editor ↔ agent context sync (agent sees what file user is viewing, what's selected)
- [ ] Inline diff approval (preview file changes before write, accept/reject/edit)
- [ ] Bearer-token auth + loopback-only default
- [ ] First-run welcome screen with prerequisite checks

### Phase 2 — Agent loop quality (what makes Steel competitive)
- [ ] **Plan mode UI** — surface Claude Code's native plan mode (`ExitPlanMode`) in a reviewable panel; user approves before execution
- [ ] **Composer-style multi-file edits** — agent shows all proposed changes as a reviewable set, not file-by-file
- [ ] **Checkpoint & rollback** — snapshot repo state before a task; one-click revert if it goes wrong
- [ ] **Context management UI** — visible token usage per message, manual file pinning, auto-trim warnings
- [ ] **Inline edits** (cmd+K in editor) — select code, describe a change, get a diff inline without leaving the file
- [ ] **Image paste + drag-drop** into chat
- [ ] **Slash commands** with autocomplete for skills, prompts, MCP tools

### Phase 3 — Keyboard-first power & accessibility
- [ ] Cmd+K command palette (everything accessible)
- [ ] Cmd+P fuzzy file search
- [ ] Cmd+shift+P action palette
- [ ] Vim mode toggle (Monaco has this built in — just needs a settings flip)
- [ ] Full keybinding customization via `~/.steel/keybindings.json`
- [ ] Focus mode (hide all panels except editor + chat)
- [ ] WCAG 2.1 AA: keyboard nav for every interactive element, visible focus rings, ARIA labels on icon-only buttons
- [ ] Screen reader support for streaming chat messages
- [ ] Theme system: ship light + dark defaults, support custom themes via `~/.steel/themes/*.json` (reuses VS Code theme format)

### Phase 4 — Polish & advanced
- [ ] Split-pane editor
- [ ] Terminal panel (bottom, real PTY)
- [ ] Settings page
- [ ] Git panel (status, diff, commit, branch switch)
- [ ] MCP server status and config UI
- [ ] Session diagnostics panel (context usage, latency, costs)
- [ ] i18n scaffold (English only at ship, but structured for later translation)

### Phase 5 — Shipping (cross into competitive territory)
- [ ] Playwright smoke test in CI
- [ ] Release automation (stable + preview channels like companion)
- [ ] Homebrew formula
- [ ] Docker image for remote/headless setups
- [ ] Docs site (Mintlify, same pattern as companion)

### Phase 6 — Ambitious (only after Phase 1–5 ship)
- [ ] **Tab autocomplete** — the CLI doesn't provide this; requires a separate lightweight model, pattern-based completion, or API integration. Requires a design doc and Tier 4 approval before starting.
- [ ] Remote Steel (run server on dev machine, UI on laptop over Tailscale)
- [ ] Collaborative sessions (multiple users, same agent, approval quorum)
- [ ] Agent-authored migrations (Steel proposes STEEL.md schema bumps via PR)

### Inherited from companion (verify still working after fork)
- [ ] WebSocket bridge (CLI ↔ browser)
- [ ] Session spawning and lifecycle
- [ ] Tool approval flow
- [ ] Streaming responses
- [ ] Multi-session tab bar
- [ ] Session persistence to disk
- [ ] Git worktree support for parallel sessions
- [ ] Named environment profiles
- [ ] `--resume` on CLI relaunch to restore conversation context

---

## File Map

_This is the **target** structure. Not everything exists yet — see Current State for what's built._
_Agent: update this whenever you add, rename, or delete a significant file._

```
steel/
├── server/
│   ├── index.ts              - Hono app entry, port 3456
│   ├── ws-bridge.ts          - CLI ↔ browser WebSocket relay
│   ├── session-manager.ts    - Spawn, kill, resume CLI processes
│   ├── protocol.ts           - NDJSON parsing; see WEBSOCKET_PROTOCOL_REVERSED.md
│   ├── auth.ts               - Bearer token validation
│   ├── safe-path.ts          - Path traversal / symlink escape prevention
│   ├── diagnostics.ts        - Local-only logging (~/.steel/logs/)
│   ├── mcp-config.ts         - Read ~/.steel/mcp.json, forward to CLI
│   ├── checkpoint.ts         - Repo state snapshots for task rollback
│   └── cli/
│       ├── start.ts          - `bunx steel` entry
│       └── diagnose.ts       - `bunx steel diagnose` bug-report bundle
│
├── ui/
│   ├── App.tsx               - Root component, layout shell
│   ├── components/
│   │   ├── Editor.tsx              - Monaco wrapper
│   │   ├── FileTree.tsx            - Left panel, project explorer
│   │   ├── ChatPanel.tsx           - Right panel, agent stream
│   │   ├── DiffViewer.tsx          - Inline file diff approval
│   │   ├── ComposerView.tsx        - Multi-file change review
│   │   ├── InlineEdit.tsx          - cmd+K ghost-text editing in Monaco
│   │   ├── PlanMode.tsx            - Agent plan review / approve
│   │   ├── CommandPalette.tsx      - cmd+K / cmd+shift+P
│   │   ├── FilePalette.tsx         - cmd+P fuzzy file search
│   │   ├── SessionTabs.tsx         - Multi-agent tab bar
│   │   ├── PermissionPrompt.tsx    - Tool approval UI
│   │   ├── ContextMeter.tsx        - Token usage / context window bar
│   │   ├── Welcome.tsx             - First-run onboarding
│   │   └── Settings.tsx            - Config, keybindings, MCP, updates
│   ├── hooks/
│   │   ├── useWebSocket.ts         - Browser WS client
│   │   ├── useKeybindings.ts       - Central keybinding registry
│   │   └── useCheckpoint.ts        - Task-scoped undo
│   └── store/
│       ├── sessionStore.ts         - Zustand: session state
│       ├── editorStore.ts          - Zustand: open files, selection
│       └── uiStore.ts              - Zustand: layout, theme, focus mode
│
├── test/
│   ├── unit/                 - Vitest unit tests
│   ├── integration/          - Server tests with mock CLI
│   ├── e2e/                  - Playwright smoke tests (Phase 5)
│   └── manual/               - Human regression checklist
│
├── docs/                     - Mintlify docs site (Phase 5)
├── STEEL.md                  - This file (canonical)
├── CLAUDE.md                 - Symlink to STEEL.md
├── WEBSOCKET_PROTOCOL_REVERSED.md  - Inherited from companion
├── CHANGELOG.md              - Generated from conventional commits
├── package.json
└── vite.config.ts
```

---

## Conventions

### Code
- TypeScript strict mode always on
- No default exports except for React components
- Functional components only, no class components
- Hooks over HOCs
- Zustand for global state, `useState` for local

### Styling
- Tailwind utility classes only — no custom CSS files unless absolutely required
- Support both light and dark modes from the start; no mode is privileged
- Design tokens live in `tailwind.config.ts`

### File naming
- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Utilities: `kebab-case.ts`

### Commits
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- One logical change per commit

### Git workflow
- Work on feature branches: `feat/monaco-editor`, `fix/ws-reconnect`, `docs/readme`
- The only exception is the Phase 0 bootstrap rename (see Getting Started)
- Open a PR for every change — see [Contribution Model](#contribution-model) for how PRs work in solo vs team mode
- PR title = conventional commit summary; PR body = what/why/testing notes
- Squash-merge by default to keep history clean

### Secrets & environment
- See [Security Model](#security-model) for the authoritative rules
- Quick reminder: never commit `.env`, `.env.local`, or anything with credentials
- `.env.example` is safe to commit with placeholders only
- User config lives in `~/.steel/`, never in the repo

### Agent behavior
- **Always** read `STEEL.md` first
- **Always** update `STEEL.md` last
- Before destructive operations (delete files, drop data), ask for confirmation
- Prefer small, verifiable changes over sweeping rewrites
- Follow The Loop from the top of this file for every task

### When Uncertain
- If a task is ambiguous, ask ONE clarifying question before starting — do not guess
- If a planned change touches the WebSocket protocol layer, stop and ask first
- If tests fail or build breaks, stop and report — do not attempt increasingly invasive fixes
- If a dependency needs to be added, note it in Session Log with justification

### Claude Code CLI protocol fragility
The `--sdk-url` flag and its NDJSON protocol are undocumented.
Anthropic may change them in any CLI update.

- If the CLI version changes and things break, the first place to check is `server/protocol.ts`
- Run `claude --version` and log it in Session Log when protocol issues occur
- Do not "clean up" or refactor the protocol parsing code casually — it is intentionally conservative
- The canonical protocol reference lives in the repo root: `WEBSOCKET_PROTOCOL_REVERSED.md` (inherited from the companion fork; keep in sync with upstream when they update it)

---

## Verification

Before considering a task done, run all of these and confirm each passes.

### Static checks
```bash
bun run typecheck    # must pass with zero errors
bun run lint         # must pass; warnings are acceptable but should be noted
bun run build        # must produce a working production build
```

### Smoke test (end-to-end)
After any change that touches the server, protocol, or session flow:

1. `bun run dev`
2. Open `localhost:5174`
3. Spawn a new session
4. Send prompt: `echo hello from steel`
5. Agent should stream a response and request permission for the Bash tool
6. Approve the permission
7. Confirm output renders in the UI
8. Close and reopen the tab — session should restore via `--resume`

If any step fails, the task is not done. Log the failure in Session Log and either fix it or revert.

### When tests exist
Once a test suite is added (Phase 2+), `bun run test` must pass before any merge.

---

## Active Issues

_Known bugs and rough edges._
_Add to this list when: you discover a bug you can't immediately fix, you ship something with known limitations, or you notice tech debt worth tracking._
_Remove from this list when: the issue is resolved (and note the resolution in Session Log)._

### Structural / ongoing

- **Upstream CLI protocol drift (ongoing concern, not a bug yet)** — The `--sdk-url` flag and NDJSON schema are undocumented by Anthropic. Any `claude` CLI update could break Steel silently. Mitigations: pin supported CLI versions in README, run smoke test against new CLI versions before updating the minimum supported version, monitor companion repo for upstream protocol patches.
- **No automated test coverage yet** — Tests come in Phase 2+. Until then, smoke test is the only safety net. Track this as tech debt.
- **Bootstrap not yet done** — Phase 0 tasks are all unchecked. Until fork is complete, everything in this file describes a target state.

---

## Session Log

_Newest entries at the top. Prepend a new entry at the end of every session — even research/planning sessions that don't change code._

**Entry format:**
```
### YYYY-MM-DD — Short title
- What changed (user-facing)
- Files touched: `path/one.ts`, `path/two.tsx`  OR  none (research/planning)
- New deps: none  OR  `package@version` (reason)
- CLI version: output of `claude --version` if protocol-adjacent
- Notes: caveats, known issues, follow-up needed
```

---

### 2026-04-17 — STEEL.md v1 drafted (14 review passes)
- Initial context document written and iterated through 14 review/fix passes
- Sections added: What Steel Is (with differentiation + non-goals), CLAUDE.md Relationship, Security Model, Performance Budget, First-Run Experience, MCP & Extensibility, Model Support, Diagnostics, Testing Strategy, Design Principles, Release Strategy, Contribution Model, What a Great Session Looks Like (with counter-example), Self-Modification Tiers, Escape Hatch
- Phases expanded from 3 to 6 with competitive features (plan mode, composer edits, checkpoints, context UI, inline edit, autocomplete in Phase 6)
- Architecture diagram upgraded to show auth, sandbox, diagnostics, MCP
- File Map expanded to reflect all planned Phase 2+ components
- Active Issues seeded with upstream fragility, test debt, and bootstrap reminder
- Added .gitignore requirements, dev-vs-prod port reconciliation, human-vs-agent intro
- Files touched: `STEEL.md` (new)
- New deps: none
- CLI version: n/a
- Notes: Phase 0 bootstrap not yet started. Next session: fork companion repo, run Phase 0 tasks on `main` as bootstrap commits, then begin Phase 1 on feature branches.

---

## Self-Build Protocol

When the user asks Steel to improve itself:

1. **Read STEEL.md fully** — understand current state before planning
2. **Identify the Self-Modification Tier** — see [Self-Modification Tiers](#self-modification-tiers) below
3. **Plan the change** — outline files touched, new files needed, migrations required (skip for Tier 1)
4. **Create a feature branch** — `git checkout -b feat/your-change` (required for Tier 2+; optional for Tier 1)
5. **Implement in small commits** — each commit should leave the repo in a working state
6. **Verify** — run all checks in the [Verification](#verification) section
7. **Update STEEL.md** — File Map, Current State checkboxes, `_Last updated:_` date, Session Log (**always, regardless of tier**)
8. **Commit the STEEL.md update as the final commit of the task**
9. **PR or direct merge:**
   - Tier 1 (typo, docs, trivial): direct push to `main` is acceptable
   - Tier 2+: always open a PR, even in solo mode, for the audit trail

### Syncing with upstream companion

Steel is forked from `The-Vibe-Company/companion`. When upstream ships protocol fixes or useful features:

1. User runs `git fetch upstream && git merge upstream/main` (or cherry-picks)
2. If conflicts touch Steel-specific files (UI, branding, `~/.steel/` paths), resolve by preserving Steel changes
3. If conflicts touch the protocol layer, resolve by **preferring upstream** — they own that code
4. Test the full flow after merge: spawn session, send prompt, approve tool, edit file, diff review
5. Log the upstream sync in Session Log with upstream commit SHA

---

## Self-Modification Tiers

Steel can modify itself. That doesn't mean it should modify anything without consideration. Changes fall into four tiers, with increasing user-approval requirements.

### Tier 1: Routine (agent proceeds independently)
- UI component changes that don't affect behavior
- Style adjustments, typo fixes, copy edits
- Adding a test for existing behavior
- Documentation updates (including STEEL.md maintenance)
- Dependency patch version bumps

### Tier 2: Normal (agent proposes plan, user confirms)
- New features within the current Phase
- Refactors scoped to a single module
- New dependencies (minor additions, justified in Session Log)
- Changes to existing endpoints or components

### Tier 3: Significant (requires explicit plan approval + staged rollout)
- Architecture changes (new modules, layer boundaries)
- Changes to the state store shape (Zustand schema)
- New top-level features (Phase boundary moves)
- Protocol-adjacent work (anything in `server/protocol.ts` or `server/ws-bridge.ts`)
- Security-sensitive changes (auth, path sandboxing, CORS)
- Dependencies that add >1MB to bundle or touch native bindings

### Tier 4: Load-bearing (requires explicit user approval + written design doc)
- Changes to the CLI spawn logic or `--sdk-url` contract
- Removing a non-goal from the non-goals list
- Changes to this Self-Modification Tiers list itself
- Replacing a major stack component (Bun → Node, React → Svelte, etc.)
- Anything involving secrets, network exposure, or telemetry
- License changes

### Rule

If uncertain which tier applies, default up, not down. Over-asking is cheap. Under-asking is catastrophic.

---

## Escape Hatch

The rules in this file are guardrails, not a cage. If you have a genuine reason to break one:

1. **Stop writing code.**
2. State the rule you want to deviate from and why.
3. Propose the alternative.
4. Wait for user confirmation before proceeding.
5. If approved, log the deviation prominently in Session Log with the word `DEVIATION:` so it's searchable.

Never silently break a rule. Never rationalize a break in hindsight.

---

## Do Not

- Do not add telemetry or analytics of any kind
- Do not add cloud dependencies Steel can't run without
- Do not break the offline-first guarantee
- Do not touch the WebSocket protocol layer without explicit user approval — it's load-bearing and fragile
- Do not introduce new dependencies without noting them in the Session Log
- Do not rewrite STEEL.md from scratch — only edit specific sections
- Do not delete the Session Log or File Map to "clean up" — they are the project memory
- Do not remove the "Do Not" list itself in a refactor
- Do not commit secrets, API keys, or `.env` files
- Do not change the LICENSE without explicit user approval (Steel inherits MIT from companion)
- Do not skip The Loop, even for "trivial" changes
