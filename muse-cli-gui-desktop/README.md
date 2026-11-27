<div align="center">

<img src="docs/assets/app-icon.png" alt="MuseCodeIcon app icon" width="112" />

# MuseCodeIcon by Don PELY

**MuseCodeIcon by Don PELY** — free, MIT-licensed desktop app (Windows, macOS, Linux) for Meta's Muse Code CLI.
**Gold on black, on every platform.**

> **Unofficial community project — not made, endorsed, or supported by Meta. Not affiliated with Meta.**

</div>

![MuseCodeIcon: start a thread in a project, black theme with gold accents](docs/assets/app-home.png)

**Download:** [MuseCodeIcon v3.2.0](https://github.com/yourbossdonpely/musecodeicon/releases/tag/v3.2.0) — `MuseCodeIcon_3.2.0_x64-setup.exe` for Windows, `MuseCodeIcon_3.2.0_amd64.AppImage` plus `.deb` and `.rpm` for Linux, and `MuseCodeIcon_3.2.0_universal.dmg` for macOS (Apple Silicon and Intel). From 0.23.8 on, the app updates itself in-app (Settings → Updates). The Windows installer is self-signed with the author's certificate (untrusted root, so SmartScreen still warns on first run: More info → Run anyway); macOS is ad-hoc signed, not notarized, so read the platform notes below before the first launch. Building from source still works too (see [From source](#from-source)).

You need the `muse` CLI installed and signed in (`muse login`) on a Muse Code plan or pay-as-you-go billing. 

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/desktop-Tauri%202-FFC131.svg)](https://tauri.app)
[![Web](https://img.shields.io/badge/web-shared%20React%20UI-61DAFB.svg)](#architecture)
[![Muse Code](https://img.shields.io/badge/powered_by-Muse%20Code%20CLI%20(MSP)-0668E1.svg)](https://developer.meta.com/ai/products/muse-code)
[![Contributors](https://img.shields.io/github/contributors/yourbossdonpely/musecodeicon.svg)](https://github.com/yourbossdonpely/musecodeicon/graphs/contributors)

> 🏆 **Why MuseCodeIcon.** More features than any other Muse GUI — including [Helicon](https://github.com/HarjjotSinghh/helicon), which hasn't shipped since v0.23.6: **30+ exclusive features** no other Muse GUI has together. **Scheduled prompts** that run themselves · **skill folders + routing** that auto-apply · **MCP server manager** · **one-click review pass** · **terminal card** · **message edit + rollback** · **task modes** (build/supervised/plan/research/debug) · **follow-up chips** · **read aloud** · **share links** · **syntax diagnostics** · **bare-path auto-attach** · **prompt history + templates** · **turn timeline** · **checkpoints + undo** · **queued message edit + send-now** · **file tree icon colors** · **session handoff** · **worktree manager** · **@-symbol mentions** · **usage forecasting** · **apply review findings** · **bulk thread ops**. Full list in [Idea](#idea).

> **MuseCodeIcon** - home of the Muses. An open-source desktop + web ADE for Meta's **Muse Code CLI** (`muse`), in the spirit of the Claude Code desktop app and the Codex / ChatGPT desktop app.

> If it helps you, [star the repo](https://github.com/yourbossdonpely/musecodeicon) — it helps others find it.

**Sidebar-first:** all projects grouped by working directory, each with its tasks and sessions - resume anything, including sessions started from the `muse` terminal TUI.

![A thread: every edited file as a chip with its line counts, the files that thread changed, and the model, speed and cost for the reply](docs/assets/app-thread.png)

<details>
<summary>Usage and settings</summary>

![Usage: what these threads would have cost at API rates, by day, by model and by thread](docs/assets/app-usage.png)

![Settings: theme (dark by default), code colours, what a new thread starts on, approvals](docs/assets/app-settings.png)

</details>

> **Colours:** gold on black. The app opens in the dark theme on every platform — the window itself is created dark, the splash page is dark, and the first paint is dark — so a light desktop never shows it light. Light and system are still two clicks away in Settings → Appearance.


> ⚠️ **Unofficial community project.** Not made, endorsed, or supported by Meta. MuseCodeIcon is a client for the **Muse Code CLI**, and is unrelated to the Muse assistant app for Mac. "Muse" and "Muse Code" are trademarks of Meta, used here only to describe what this client connects to. This is **not legal advice** - see [Legal](#legal).

---

## Idea

Muse Code today is terminal-only (`muse`, on macOS, Linux and Windows). MuseCodeIcon wraps it in a Codex/Claude-style experience:

- **Projects** grouped by directory the agent worked in (incl. isolated worktrees)
- **Sessions/tasks** per project with full history, resume, and diffs
- **Approvals** surfaced honestly (`onRequest / promptUnmatched / denyUnmatched`), never bypassed
- **One codebase** for desktop (Tauri) and web (same React UI against a remote daemon)
- **Windows that actually works** - runs Muse Code for Windows natively (no WSL), or Muse inside WSL2 with path translation if that is what you use
- **A file viewer beside the thread** - browse the project, read highlighted source, preview and edit Markdown, and view images, video and PDFs; paths Muse Code mentions open there
- **Your real plan meter** - the 5-hour window and weekly cap as Muse Code reports them, in the sidebar and on the usage page
- **Goals you can steer** - set, pause, resume, change and clear a `/goal` from the goal panel or the composer
- **Background work under control** - send a running tool call to the background, stop one, or stop them all; cancel a workflow run, or skip and retry its agents
- **Reasoning effort that sticks** - applied as the session's own default, which is the level `muse serve` actually uses
- **Follow-up chips** - every finished reply ends with clickable next steps; fallbacks tune to the thread's task mode
- **@file mentions** - type `@` in the composer to attach project files; contents ride along with the prompt
- **Share links** - copy a localhost-only replay link for any thread from its menu
- **Read aloud** - speaker button under finished replies, voice + speed in Settings
- **Check syntax** - the files-changed card runs node/JSON/Python/tsc/PowerShell checks on the thread's edits
- **Task modes** - Build, Supervised, Plan, Research or Debug framing per thread, picked in the composer
- **Delete threads** - confirmed, tombstoned so refresh never resurrects them; refused mid-turn
- **Right-click menus** - sidebar threads and projects open the same actions as their three-dots menus
- **Skill folders** - keep any folder of `SKILL.md` skills; `~/.agents/skills` is always scanned; managed from the thread header or Settings
- **Skill routing** - a plain prompt that reads like a folder skill sends with its instructions automatically (toggleable)
- **One-click Muse install** - first-run setup installs the CLI via Meta's official installer, no terminal detour
- **Edit and rollback** - sent messages offer Copy, Edit-and-resend, and Rollback (reopens history through that turn in a new thread)
- **Command palette actions** - settings/usage pages plus stop, compact, read aloud, share, syntax check, fork, archive, delete for the open thread
- **Turn timeline rail** - a minimap of the thread's turns; click a segment to jump to it
- **Prompt templates** - keep named starters in the composer toolbar; the input auto-grows
- **Starter prompts** - empty threads and fresh projects suggest first prompts that fill the composer
- **Compact density** - squeezes thread and sidebar rows; Settings Appearance or the palette
- **Cancellable progress** - long operations show a spinner toast with Cancel past 300ms
- **Prompt history** - Up/Down in an empty composer recalls sent prompts, terminal-style
- **MCP servers** - add and remove user-scope servers in Settings; new threads pick them up
- **One-click review** - the files-changed card sends the diff for a review pass
- **Terminal card** - run shell commands from the thread dock; output stays with the thread
- **Scheduled prompts** - daily-clock prompts that run themselves in their threads while the app is open
- **Auto-attached context** - bare `dir/file.ext` paths named in a prompt attach like `@` mentions
- **Queued message edit + send-now** - click any queued message to revise it, or force it through immediately
- **File tree icon colors** - gold folders with purpose colors (`.git`, `api`, `server`, `tests`…) and a hue per file type
- **Session handoff** - export any thread to a file, import it on another machine as a new session
- **Worktree manager** - list, add, remove and prune git worktrees from the project menu
- **@-symbol mentions** - `@file#name` pins one definition instead of attaching the whole file
- **Usage forecasting** - every meter projects the cap or the landing percentage
- **Apply review findings** - review replies grow a button that sends the model to fix them
- **Bulk thread ops** - tick rows to archive, pin and delete threads together

## Architecture

```
packages/ui      shared React UI (desktop + web, single source of truth)
packages/daemon  Node service: spawns `muse serve` per workspace, speaks MSP (JSON-RPC/stdio)
apps/desktop     Tauri 2 shell (Win/Mac/Linux) wrapping packages/ui
apps/web         same UI against a remote daemon
```

- Protocol: **Muse Session Protocol (MSP)** via the official [`@muse-code/sdk`](https://github.com/meta-models/muse-code-sdk) (MIT) + `muse schema generate-ts` types. No TUI scraping.
- Auth: user's own `muse login` (`~/.config/muse/auth.json`). MuseCodeIcon never stores credentials.
- State: local SQLite - `projects (cwd/worktree) → sessions → turns`.

## Roadmap

- [x] Name locked: **MuseCodeIcon** · stack locked: **Tauri + shared React UI**
- [x] PRD + UX spec (sidebar, session view, diffs, approvals) — upstream docs not included in this copy
- [x] `packages/daemon` - MSP connect, list/resume sessions, send/steer, approvals
- [x] `packages/ui` - projects sidebar, session chat, inline diffs, slash commands and skills, goals
- [x] `apps/desktop` - Tauri shell + WSL2 routing + path translation + in-app updater (own `latest.json` feed and signing key)
- [x] `apps/web` - the same UI in a browser against the local server
- [x] `apps/web` - remote daemon mode
- [x] Windows end to end (native Muse Code for Windows, or WSL2 Ubuntu)
- [x] GitHub Releases with a Windows installer (`v0.23.7`; unsigned, so SmartScreen warns)
- [x] macOS releases (universal binary for Apple Silicon and Intel; `v0.23.7`, ad-hoc signed, not notarized)
- [x] Linux builds and releases (`v0.23.7`: AppImage, `.deb`, `.rpm`)
- [x] In-app updates (`v0.23.8`: launch + six-hour checks, sidebar dot, Settings → Updates, install on close)
- [x] Update-check feedback + changelog link (`v0.23.9`)
- [x] Bridge feature ports (`v0.23.10`: chips, mentions, share links, read-aloud, diagnostics, task modes)
- [x] Delete thread, right-click menus, author spelling (`v0.23.11`)
- [x] Skill folders + agents auto-scan + prompt routing (`v0.30.0`)
- [x] Guided Muse install + message Edit/Rollback (`v1.1.0`)
- [x] UI polish: palette actions, timeline rail, templates, starters, density, progress (`v1.2.0`)
- [x] Proven macOS Intel coverage in CI (`v1.2.1`)
- [x] Prompt history, MCP servers, review pass, terminal card, schedules, auto-attached context (`v3.0.0`)
- [x] Canonical updater URL, repo renamed, bridge filed away, composer send pinned right (`v3.0.1`)
- [x] Queued message edit + send-now, file tree icon colors (`v3.1.0`)
- [x] Session handoff, worktrees, symbol mentions, forecasting, review fixes, bulk ops (`v3.2.0`)
- [ ] Post-v1: mobile relay to steer running sessions from a phone

## Install

Windows: download [`MuseCodeIcon_3.2.0_x64-setup.exe`](https://github.com/yourbossdonpely/musecodeicon/releases/download/v3.2.0/MuseCodeIcon_3.2.0_x64-setup.exe) from the [v3.2.0 release](https://github.com/yourbossdonpely/musecodeicon/releases/tag/v3.2.0), or build one from source (see [From source](#from-source)) — it lands in `apps/desktop/src-tauri/target/release/bundle/nsis/`. **Not** the 58 KB `MuseCLIGUI.exe` attached to the older `v2.6.x` releases: that is the bridge GUI's launcher, needs `muse-bridge.js` and `gui/` beside it, and stops with `Missing file: ...muse-bridge.js` if you run it alone. The desktop installer is self-signed with the author's certificate (DigiCert timestamped, untrusted root — SmartScreen still warns that the publisher is unknown, so click More info, then Run anyway). From 0.23.8 on, the app checks for updates itself — see Settings → Updates. (Coming from 0.23.7? Install 0.23.8 once from here; that version cannot update itself.)

MuseCodeIcon bundles its own Node.js, so you only need Muse Code for Windows (`irm https://dev.meta.ai/install.ps1 | iex` in PowerShell) with `muse login` done once. Already run Muse inside WSL2? MuseCodeIcon uses that when native Muse is not installed; set `MUSECODEICON_MUSE_RUNTIME=wsl` to keep WSL when both are, and `MUSECODEICON_WSL_DISTRO=<name>` (for example `Ubuntu-24.04`) to pick the distro instead of WSL's default. MuseCodeIcon uses the login you already have and never stores credentials of its own.

macOS: download `MuseCodeIcon_3.2.0_universal.dmg` from the [v3.2.0 release](https://github.com/yourbossdonpely/musecodeicon/releases/tag/v3.2.0). It runs on Apple Silicon and Intel and is not Apple-notarized. On macOS 15 or later, open MuseCodeIcon once, click Done on the warning, then go to System Settings > Privacy & Security and click Open Anyway. On macOS 14 or earlier, right-click the app, then Open. Or, in Terminal: `xattr -dr com.apple.quarantine /Applications/MuseCodeIcon.app`.

MuseCodeIcon bundles its own Node.js, so you only need the `muse` CLI (`curl -fsSL https://dev.meta.ai/install.sh | bash`) with `muse login` done once, however you installed it. MuseCodeIcon uses the login you already have and never stores credentials of its own.

Linux: download `MuseCodeIcon_3.2.0_amd64.AppImage` from the [v3.2.0 release](https://github.com/yourbossdonpely/musecodeicon/releases/tag/v3.2.0); the same release carries `.deb` and `.rpm` packages for distro installs. The AppImage runs on most distributions (it needs FUSE, `libfuse2`, on some of them). Before the first launch, make it executable and run it (`chmod +x MuseCodeIcon_*.AppImage`, then `./MuseCodeIcon_*.AppImage`), or right-click it in your file manager and allow executing it as a program.

MuseCodeIcon bundles its own Node.js, so you only need the `muse` CLI (`curl -fsSL https://dev.meta.ai/install.sh | bash`) with `muse login` done once, however you installed it. MuseCodeIcon uses the login you already have and never stores credentials of its own.

Scope: the desktop app only (Windows, macOS, Linux). There is no VS Code, Cursor or Windsurf extension in this copy, and none is published for it.

[Discussions](https://github.com/yourbossdonpely/musecodeicon/discussions) is the place for questions and for what you are building with it.

## Docs

This copy has no landing site, guides site, or per-feature docs pages; nothing outside this folder is linked from here. What is here: this README, [`BUILD-LOG.md`](BUILD-LOG.md) — what was copied from upstream, the rename, the updater removal, the Node-sidecar tar fix, the exact build commands and their output, test counts, and the open release blockers — [CONTRIBUTING.md](CONTRIBUTING.md), and the screenshots in `docs/assets/`, captured from this build.

## From source

Prereqs (source builds and the web app only - the desktop installers bundle Node.js): Node 22+, the `muse` CLI with `muse login` done once (natively or in WSL2 on Windows), and the repo checked out.

```bash
npm install
npm run build --workspace @musecodeicon/daemon --workspace @musecodeicon/ui --workspace @musecodeicon/server
npm run build --workspace @musecodeicon/web

# Web app (serves the built UI plus the API on :3127)
npm run serve --workspace @musecodeicon/web
# open http://127.0.0.1:3127, add a folder, start a thread
```

Projects, pins, thread titles and archive state persist in `~/.musecodeicon/musecodeicon.db` (pass `--data-dir` to the server to move it, or `:memory:` for a throwaway run). Threads you started from the `muse` terminal are discovered automatically and appear under their project.

UI development with hot reload:

```bash
# terminal 1: the API against your real muse
node packages/server/dist/src/cli.js --port 3127
# terminal 2: Vite compiles packages/ui straight from source
npm run dev --workspace @musecodeicon/web
# open http://127.0.0.1:5173
```

No `muse` on this machine? `npm run dev:demo --workspace @musecodeicon/web` runs the same UI against an in-memory client with sample projects and threads, no server needed.

The interface itself lives in `packages/ui` (state model in `src/model`, components in `src/components`); design tokens and the visual system are in src/theme.css and the components under packages/ui/src/components/ (upstream design docs are not included in this copy).

```bash
# Desktop app (dev shell; needs the Tauri prereqs on your OS)
npm run dev --workspace musecodeicon-desktop
```

Releases ride on tags: pushing a `v*` tag that matches `tauri.conf.json` runs `.github/workflows/release.yml`, which builds the Windows installer first, then the universal macOS build and the Linux bundles side by side, and attaches all of them to a GitHub Release. Every release gets a tag; notable merged PRs bump at least the patch version.

From 0.23.8 on, the desktop app checks for updates on launch and every six hours (Settings → Updates, sidebar menu, command palette) against its own `latest.json` feed, signed with its own key — it never pulls another project's releases. Coming from 0.23.7? Install 0.23.8 once manually; that version cannot update itself.

## Remote daemon

The web app can run against a daemon on another machine. Start it there with a token and the origin that will be loading the page:

```bash
node packages/server/dist/src/cli.js --host 0.0.0.0 --port 3127 \
  --token "$(openssl rand -hex 24)" --allow-origin https://musecodeicon.example
```

Then load the page, go to `#/connect`, and give it the address and the token. Both are kept in local storage rather than in the URL: the token is exchanged once for an `HttpOnly` cookie, which is what the event stream authenticates with, since `EventSource` cannot carry a header.

Two things fail closed deliberately:

- An origin that was never passed to `--allow-origin` gets no CORS headers and no answer at all.
- A token in the query string counts only for requests carrying no other site's origin, so a copied link hands over nothing.

Browsers only accept cross-site cookies over HTTPS, so a daemon reached from another origin needs TLS or a tunnel in front of it. On the same machine none of this applies: `#/connect` with an empty address uses the server that served the page, and no token is needed unless one was set.

## What leaves your machine

Your code, prompts, threads and files stay where they are: MuseCodeIcon talks to the `muse` CLI on your own computer, with
your own login, and keeps its state in SQLite beside it. There is no account and no analytics in the app.

The desktop app contacts the GitHub release server only to check for updates (on launch and every six hours, pausable in Settings → Updates). Those requests carry no identity, and there is no install-counting telemetry.

## Legal

- Wrapper clients are the intended path (Meta ships an MIT SDK for building MSP clients). This repo builds on that, and on the open-source CLI client.
- **Name:** `MuseCodeIcon` was chosen to avoid the `Muse` mark. Do not reintroduce `Muse` into the binary name, bundle ID, domain, or title without a trademark review.
- **Never** claim to be official, never bundle credentials, never bypass billing/approvals.
- Contributor-tier reminder: prompts/completions sent on Contributor models may be used to improve Meta's products - surface this in-app before users run it.
- Get a licensed attorney to review before first release. See also: [Meta Brand Resources](https://www.meta.com/brand/resources/meta/our-trademarks), [Muse Code product page](https://developer.meta.com/ai/products/muse-code), [Model API docs](https://dev.meta.ai/docs/coding-agents).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs welcome.

Not a code change? [Discussions](https://github.com/yourbossdonpely/musecodeicon/discussions) takes questions, setups that did not work, and anything you want MuseCodeIcon to do that it does not.

## License

[MIT](LICENSE) © 2026 Harjot Singh Rana and contributors.

