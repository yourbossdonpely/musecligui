# Muse CLI GUI

**Muse Code CLI · AI Coding Agent GUI (v2.5)**

## Overview

A custom HTML GUI that drives **Meta Muse Code** (your paid subscription) through the official `muse` CLI — no permission prompts unless you want them, live streaming agent runs, real skills/models/usage from the CLI, a real file browser, a browser + deep-research panel, and per-run permission control. It also serves an OpenAI-compatible API, so OpenCode or FreeBuff can drive the same subscription.

**Portable:** this folder is self-contained — copy or move it anywhere and it runs from there. All launchers resolve paths from their own location (`%~dp0`); no folder is hardcoded. Clone or unzip it anywhere — all paths resolve from the app folder itself.

## Features

| Area | What it does |
|------|--------------|
| **Agent chat** | Live streaming replies, live tool-call cards, run log, Stop button, multi-turn memory (transcript sent with each run), stable session id per GUI session |
| **Modes** | Build (full speed), Supervised (sandbox on), Plan (read-only), Research (web + citations), Debug (reproduce/diagnose/fix) |
| **Permissions** | Mode presets plus every flag individually: yolo, approval mode, trust workspace, sandbox, sandbox network, file writes, shell, web tools — with a live CLI preview |
| **Models** | Real list from `muse exec --list-models`, reasoning effort, contributor mode |
| **Projects** | Add/select/delete projects, sub-sessions per project, messages persisted per session, session export to Markdown |
| **Skills** | Real list from `muse skills list`, enable/disable in the real CLI config |
| **File browser** | Real filesystem tree for the selected project, file preview, attach files to prompts (up to 5) |
| **Browser tab** | URL preview + open externally + one-click "Research this page" |
| **More tab** | MCP servers, running sessions (`muse sessions`), git status / changed files, bridge info, API access (endpoint + key) |
| **Subscription** | Live tier + window/weekly allowance from `muse usage`, refreshed after every run |
| **Token counts** | Real input/output tokens per run from the CLI event stream |
| **Demo Mode** | GUI stays usable with scripted replies when the bridge is down |
| **Proxy API** | OpenAI-compatible `POST /v1/chat/completions` (+ `/v1/models`, `/health`) on localhost:8766 — use the subscription from OpenCode or FreeBuff |

## How It Works

- `muse-gui.html` (single file, no build step) talks WebSocket to `muse-bridge.js` on `ws://localhost:8765`.
- The bridge spawns the real `muse` binary directly (`muse-bin-*.exe`, newest wins — falls back to `muse.cmd`, then `muse` on PATH) and streams `muse exec --json` events: text deltas, tool/task lifecycle, token usage, terminal result.
- Prompts travel via `--prompt-file`, so any text (quotes, symbols, newlines) is passed safely with zero shell-quoting risk.
- Each run executes inside the selected project's folder. The bridge refuses to run when the OS temp folder is inside the project folder (the Muse runtime fails there — e.g. never pick your home folder as a project).
- Old `{command}`-only messages still work (legacy `{type:'output'|'error'}` reply).

### Bridge protocol (for hackers)

Client sends `{id, action, ...}`. Requests get `{id, type:'result', ok, data|error}`; `exec` streams `exec-start / exec-delta / exec-tool / exec-log / exec-usage / exec-done`.

Actions: `exec` (command, cwd, mode, model, effort, contributor, sessionId, maxSteps, flags, history, context, provider), `stop`, `ping`, `skills-list`, `skills-set`, `models-list`, `usage`, `mcp-list`, `sessions-list`, `fs-list`, `fs-read`, `git-status`.

`MUSE_CMD` may point at a `.js` stub (run with node) — the test suite uses this. `MUSE_BRIDGE_PORT` overrides the port.

## Launchers (all portable)

- `launch-muse-gui.bat` — One click: starts the bridge if needed, then opens the GUI
- `start-bridge.cmd` — Runs the bridge server (installs `ws` dependency on first run)
- `muse-full.cmd` — Launches Muse CLI directly with all permission flags disabled
- `opencode.cmd` — Shim for the OpenCode desktop CLI

## How to Use

1. Double-click **`MuseCLIGUI.exe`** (or `launch-muse-gui.bat`). If Windows SmartScreen asks, choose More info > Run anyway.
2. Click **+ Add Project**, enter a name and a real project folder (not your home folder).
3. Pick a mode in the toolbar (Build / Supervised / Plan / Research) or open **Permissions** to tune flags.
4. Click the model stat to pick a model/effort; type below and Send. Stop interrupts a run.
5. Browse real files on the right; click a file to preview and **Attach to prompt**; use the Browser tab for page previews and one-click research.

## Use with OpenCode / FreeBuff (OpenAI-compatible API)

The bridge doubles as an OpenAI-compatible server, so your Muse subscription works two ways: the built-in GUI, or any external client that supports custom OpenAI endpoints (verified live with OpenCode 2026-11-21).

- **Endpoint:** `http://127.0.0.1:8766/v1` (localhost only, never exposed to the network)
- **API key:** GUI Inspector -> More -> API access (copy button), or the `.muse-api-key` file next to `muse-bridge.js` (auto-created on first run, never committed to git)
- **Models:** live from `muse exec --list-models` (e.g. `muse-spark-1.3`); `GET /v1/models` lists them
- **Calls:** `POST /v1/chat/completions`, buffered or SSE (`stream: true`); send `{"metadata": {"cwd": "C:\\proj"}}` to run in a folder; max 3 concurrent runs

OpenCode provider block for `~/.config/opencode/opencode.json`:

```json
"muse": {
  "name": "Muse CLI GUI",
  "env": ["MUSE_BRIDGE_API_KEY"],
  "package": "@opencode/ai/providers/openai-compatible",
  "settings": { "baseURL": "http://127.0.0.1:8766/v1" },
  "models": { "muse-spark-1.3": { "name": "muse-spark-1.3" } }
}
```

Set the `MUSE_BRIDGE_API_KEY` env var to the key, then fully restart OpenCode (desktop app AND its background service predate the key otherwise) and pick a `muse/...` model. Gotcha we hit: the background service inherits env at launch, so a stale service says Invalid API key until restarted.

FreeBuff / other clients: add a custom OpenAI-compatible provider with the endpoint + key above. (FreeBuff custom-provider support is unconfirmed - your client runs locally, so the localhost endpoint is reachable; try it and see.)

Cost note: every API call spends subscription prompts (one agent run per call), and runs execute in the bridge folder unless `metadata.cwd` is set.

## Development (GUI source + tests)

- GUI source lives in `gui/` (React + TypeScript + Vite + Tailwind, single-file `dist/` build).
- `cd gui && npm install`, then `npm run dev` (dev server), `npm test` (unit + component), `npm run test:e2e` (needs stub bridge — see below), `npm run build` (rebuilds committed `gui/dist`).
- Bridge protocol suite: `npm install` at root once, then `npm run test:bridge` (self-contained: spawns stub-backed bridge, 30 checks).
- Rebuilding the exe after `Launcher.cs` changes: `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /out:MuseCLIGUI.exe /reference:System.Windows.Forms.dll Launcher.cs`.
- The exe/launcher open `gui/dist/index.html`, falling back to legacy `muse-gui.html` if dist is absent.

## Environment Overrides (optional)

| Variable | Default | Purpose |
|----------|---------|---------|
| `MUSE_CMD` | newest `muse-bin-*.exe`, else `muse.cmd`, else PATH | Which Muse executable the bridge runs (or a `.js` stub for tests) |
| `MUSE_BRIDGE_PORT` | `8765` | Bridge port (must match `BRIDGE_URL` in `muse-gui.html`) |

## Requirements

- **A Muse Code subscription** (any plan) — the app drives the official `muse` CLI with whatever plan you have signed in.
- **Node.js** on PATH (or use the release zip, which bundles it).
- **The official `muse` CLI** installed and logged in.
- Models are discovered live via `--list-models` (Spark, Wonder, Ember families); contributor variants via `--contributor-mode`. Usage allowances depend on your plan — watch the Subscription panel.

## Important Notes

1. **Subscription keys only work in the official `muse` CLI** (`client_attestation_denied` elsewhere). This GUI works by driving that CLI — nothing bypasses Meta's client check.
2. **Headless runs cannot answer approval prompts**, so the practical approval default here is `never`; use Supervised/Plan modes (sandbox on, writes/shell gated) when you want guardrails.
3. **Bridge must be running** for real CLI control (`launch-muse-gui.bat` starts it; otherwise Demo Mode).
4. **Moved folder?** If you pinned the old taskbar shortcut, delete it and re-pin `launch-muse-gui.bat` from the new location.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| GUI won't connect | Run `start-bridge.cmd`, then click the status bar to retry |
| "temp folder is inside" error | Pick a project folder that does not contain the OS temp dir (never your home folder) |
| No projects showing | Click "+ Add Project" and add one, then select it |
| File browser empty/errors | Select a project first; check the folder path exists |
| Model not changing | Click the model stat in the status bar |
| Bridge crashes | Restart with `start-bridge.cmd` from this folder |

## Verification (all observed passing)

- 29 bridge protocol tests against a stub CLI (streaming, stop, validation, escape-blocking, legacy compat)
- 21 end-to-end GUI tests in headless jsdom against the stub-backed bridge (connect, skills toggle, models, permissions, projects, real file tree, preview, attach, streaming, tool cards, tokens, browser, research, MCP/sessions/git, stop)
- Live run through the real `muse` exe: echo provider streams correctly; 1 approved subscription prompt returned exactly `GUI_OK`
- Real CLI exit codes confirmed 0 for `usage`, `skills list`, `--list-models`, `mcp list`, `sessions`, `exec`

## Future Enhancements

- In-GUI file editing (currently: browse/view/attach; the agent edits)
- Checkpoints/undo with diffs (shadow history)
- Slash commands and custom agent modes
- Multi-run queue and parallel sessions

## Changelog

## [v2.5.0] - 2026-11-21

- **OpenCode verified end-to-end**: the proxy API drives a real Muse subscription inside OpenCode - standalone GUI or external client, your choice. README documents setup for OpenCode + FreeBuff.
- Version bump: bridge 2.5.0, GUI requires bridge >= 2.5.0. Full suites green: 40/40 protocol, 75/75 GUI.


## [GUI restyle] - 2026-11-21

- **OpenCode-look restyle** from real tokens extracted from the OpenCode desktop bundle: layered dark greys, blue accent, Inter/IBM Plex Mono. Styled code blocks, live cursor, thinking/shimmer/pulse animations added (all were unstyled); Sub % folded into the composer status bar. All functionality and tests unchanged (75/75).


## [v2.4.1] - 2026-11-21

- **Proxy stream fix**: SSE now ends with a finish_reason stop chunk before [DONE]. Without it OpenCode treated every reply as truncated and retried (live-test finding). New api-stream-finish protocol check; suite 40/40 green.
- OpenCode wiring validated live: clean opencode.json (corrupt concat fixed, muse provider added), old muse-code plugin retired, opencode run --model muse/muse-spark-1.3 returns step-finish reason=stop with zero retries.


## [v2.4.0] - 2026-11-21

- **OpenAI-compatible proxy API** on the bridge (`http://127.0.0.1:8766/v1`, localhost-only, bearer key persisted in gitignored `.muse-api-key`): `GET /health`, `GET /v1/models`, `POST /v1/chat/completions` (buffered + SSE `stream: true`), `metadata.cwd` per call, max 3 concurrent agent runs. Powers OpenCode/FreeBuff wiring; spend comes from the user's own Muse subscription.
- Bridge refactor: shared exec engine drives GUI (WS :8765) and HTTP; new `api-info` WS action exposes endpoint + key to the GUI.
- GUI: Inspector More tab gains an "API access" section showing endpoint + key with copy button; MIN_BRIDGE bumped to 2.4.0 (older bridges get an update banner).
- Protocol suite: 39/39 green (incl. 9 new HTTP checks: health/auth/models/chat/stream/400s/404). GUI suite: 75/75 incl. new API-panel test. (updated as I work)

- **2026-11-20, v3.0.0 React GUI:** complete rebuild in React + Vite + Tailwind (new amber agent-console design, thinking narration, typed tool cards, markdown answers, checkpoints, folder picker, dual usage bars, welcome hero, session import/export, MCP dialog, slash commands, send queue, checkpoint diffs). 68 unit + 5 E2E + 30 protocol tests green. Legacy single-file `muse-gui.html` kept as fallback.
- **2026-11-20, modes+compat:** new Debug mode (reproduce/diagnose/fix/verify); bridge/GUI version handshake with an outdated-bridge banner (kills the "Unknown action" class of confusion); proxy research in `apidesign.md`.
- **2026-11-20, v2.0.1:** `MuseCLIGUI.exe` one-click launcher, ready-to-run zip with bundled Node.js, bridge prefers bundled node, consistent Muse CLI GUI naming.
- **2026-11-20, release v2.0.0:** published on GitHub Releases (https://github.com/yourbossdonpely/musecligui/releases/tag/v2.0.0).
- **2026-11-20, launcher reliability:** fixed `start-bridge.cmd` batch parse error (a `(...)` comment inside a block aborted the script, so the window blinked off) and the `launch-muse-gui.bat` port check (`findstr` needs `/C:` for patterns with spaces - it always saw the port as busy and skipped the bridge). The launcher now starts the bridge if needed, waits for the port, then opens the GUI, and stays open with the error if the bridge fails.
- **2026-11-20, stuck "thinking" fix:** the GUI now surfaces run failures (e.g. a project folder containing the OS temp dir) instead of hanging on "Muse is thinking", warns if the bridge takes over 45s to start a run, and the bridge ignores stdin (no stdin hangs) plus logs every run start/finish/reject to its window.
- **2026-11-20, v2 release:** streaming exec, permissions + modes, real skills/models/usage/MCP/sessions, real file browser, browser + research tab, stop button, token counts (see Features).

## Git

- Repo initialized 2026-11-20. `node_modules/`, `*.log`, and the pre-existing `browse.exe*` files are ignored (see `.gitignore`) - they stay on disk, just untracked.
- Workflow: every change is committed as I work and pushed to the remote below.
- Remote: https://github.com/yourbossdonpely/musecligui (public)

---

**Project:** Muse CLI GUI — AI coding agent GUI for the Meta Muse Code CLI
(portable — runs from wherever it is cloned or unzipped)
