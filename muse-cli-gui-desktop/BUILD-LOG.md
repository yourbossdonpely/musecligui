# MuseCodeIcon — Build Log

How this Windows installer is produced, end to end, from the upstream copy to
`MuseCodeIcon_0.23.6_x64-setup.exe`. Anyone with these prerequisites can
reproduce it.

## Prerequisites

| Tool | Version observed |
|------|------------------|
| Node.js | v22.23.4 |
| npm | 10.9.9 |
| Rust / Cargo | 1.99.0 |
| `muse` CLI + `muse login` | Required to *run* the app (not to build it) |
| Tauri system deps (Windows) | WebView2 + MSVC Build Tools (Tauri 2 checks) |
| Network access | Yes — `fetch:node` downloads Node.js; NSIS is fetched by Tauri |

## Step 1 — What was copied from Helicon (MIT)

Upstream: https://github.com/HarjjotSinghh/helicon (MIT). The fork's `LICENSE`
now names Don PELY and contributors as the copyright holder.

This folder (`muse-cli-gui-desktop/`) contains only the desktop pieces,
extracted with `git archive`:

- `apps/web` — React UI (shared with the browser demo)
- `apps/desktop` — Tauri 2 shell + Node sidecar scripts
- `packages/daemon`, `packages/server`, `packages/ui`
- Root npm files (`package.json`, `package-lock.json`, `tsconfig.base.json`,
  `.editorconfig`, `.nvmrc`), `LICENSE`, `README.md`, `CONTRIBUTING.md`

Deliberately NOT copied: the landing site, the VS Code extension, docs guides.
The clone used for the copy (`helicon-clone/`) was deleted afterwards.

### Updater disabled (before the rename)

Helicon ships an in-app updater pointing at `helicon.sh` and Helicon's GitHub
releases, which a renamed build would pull. Before renaming, the updater was
removed entirely:

- `apps/web/src/updater.ts` — `desktopUpdater()` returns `undefined` (the whole update
  manager was deleted afterwards, see the cleanup pass at the end)
- `apps/desktop/src-tauri/src/main.rs` — `.plugin(tauri_plugin_updater…)` removed
- `apps/desktop/src-tauri/Cargo.toml` — `tauri-plugin-updater` dep removed
- `apps/desktop/src-tauri/capabilities/main.json` — `updater:default` removed
- `apps/desktop/src-tauri/tauri.conf.json` — `plugins.updater` and
  `createUpdaterArtifacts` removed

## Step 2 — Rename to MuseCodeIcon

Bulk rename across 95 files, then targeted fixes:

- `@helicon/` → `@musecodeicon/`; `helicon-desktop` → `musecodeicon-desktop`
- Identifier `com.helicon.desktop` → `com.musecodeicon.desktop`
- `helicon://` → `musecodeicon://`; `HELICON_` → `MUSECODEICON_`
- Display strings "Helicon" → "MuseCodeIcon" (product name, window title,
  splash page, error pages in `main.rs`)
- Repo links → `yourbossdonpely/musecligui` (kept as the repo path)
- Special cases: `MuseCodeIconApp.tsx` (renamed from `HeliconApp.tsx`),
  class names `MuseCodeIconController/Error/Client/Store/MspHost/Event`
- `fetch-node.mjs`: sidecar env var `MUSECODEICON_NODE_TARGET`, Linux binary
  `musecodeicon-node`
- README disclaimer added: *"Unofficial community project — not made, endorsed,
  or supported by Meta. Not affiliated with Meta."*
- Screenshots: upstream's `docs/assets/` images were replaced with captures of
  this build, and recaptured later from the running `musecodeicon.exe` window
  (home, thread, usage, settings). Nothing in `docs/assets/` shows upstream
  branding.

The GitHub repo path `yourbossdonpely/musecligui` is intentionally preserved
(it is the repository name, not the product name).

## Step 3 — Branding: the icon and gold-on-black

### App icon

The icon is drawn, not stock: `apps/desktop/assets/make-icon.py` (Pillow, no network) renders a
gold geometric M with a spark on a near-black rounded tile at 4x and downsamples it, so the
diagonals stay clean. It is the same mark the UI's `<Logo>` draws, so the taskbar icon, the
installer and the sidebar header show one logo. Tauri turns it into every platform size:

```bash
cd apps/desktop
python assets/make-icon.py && npx tauri icon assets/icon-source.png
```

That writes `src-tauri/icons/` (`.ico` for Windows, `.icns` for macOS, PNGs, Store/Square logos,
Android and iOS sets). The same PNGs are reused by the web build:
`apps/web/public/favicon-32.png`, `favicon.ico`, `apple-touch-icon.png`, `icon-128.png`.

Verified in the built exe with `[System.Drawing.Icon]::ExtractAssociatedIcon(...)`: the gold M is
the embedded icon. Re-run the command above if the source art changes, then rebuild.

### Dark and gold as the product default

Two changes, so the first paint is already dark:

1. `packages/ui/src/model/store.ts` — `defaultPrefs().theme` is `"dark"` (it was `"system"`).
   Light and system stay selectable in Settings → Appearance.
2. `apps/web/index.html` — the pre-paint script sets `data-theme = "dark"` unless stored prefs
   say otherwise, so nothing flashes light on a light-mode OS. Both `theme-color` metas are `#0A0806`,
   matching the Tauri window (`theme: "Dark"`, `backgroundColor: "#0A0806"`).
3. `apps/web/src/theme.css` — the accent family is gold (`oklch(0.845 0.152 87)` on dark, with
   near-black `--accent-fg`), the dark neutrals are near-black and warm-tinted (hue 78, `--bg`
   `oklch(0.112 0.008 78)`, sidebar `oklch(0.078 0.007 78)`), and the borders and hairlines carry
   a little gold; and the first-run folder art and `--chart-1` follow the accent.
   Light mode keeps the same gold accent on white.

The sidebar's "MuseCodeIcon is in your editor too" card was removed: this copy ships no VS Code
extension, and the card linked to a marketplace listing that does not exist.

## Step 4 — fetch-node tar fix (Windows)

`apps/desktop/scripts/fetch-node.mjs` downloads Node.js v22.23.2 and extracts
the zip with `tar`. On a Git Bash machine the first build failed with:

```
tar: Cannot connect to C: resolve failed
Error: Command failed: tar -xf C:\dev\…\node-v22.23.2-win-x64.zip …
  status: 128
```

Root cause: bare `tar` on PATH is Git Bash GNU tar 1.35, which reads a
`C:\...` path as a remote archive host. Fix (in `fetch-node.mjs`): on Windows,
use the system bsdtar explicitly:

```js
const tarCmd =
  process.platform === "win32"
    ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe")
    : "tar";
execFileSync(tarCmd, ["-xf", archive, "-C", cacheDir, `${dist.name}/${dist.member}`], { stdio: "inherit" });
```

After the fix: `sidecar ready: ...\binaries\node-x86_64-pc-windows-msvc.exe`
(83 MB, exit 0). Do not revert this — GNU tar cannot extract Windows-path zips.

## Step 5 — Exact build commands and results

All commands run from `muse-cli-gui-desktop/` on Windows (Git Bash).

### Install

```bash
npm install
```

Result: exit 0. Later rerun after the rename:
`added 5 packages, removed 5 packages, and audited 325 packages in 3s`.
Full output: `npm-install-musecodeicon.log`.

### Workspace build (includes `tauri build` for the desktop workspace)

```bash
npm run build
```

This runs `npm run build --workspaces --if-present`. Output (two runs
reproduced identically; latest rerun: `build-rerun.log`):

- `@musecodeicon/daemon`, `@musecodeicon/server`, `@musecodeicon/ui` —
  `tsc -p tsconfig.json`, clean, no errors
- `musecodeicon-desktop` → `tauri build` → `beforeBuildCommand`:
  1. `npm run build --workspace @musecodeicon/web` — `tsc -p tsconfig.json && vite build`
     → `✓ 5490 modules transformed`, `✓ built in 6.85s`, `dist/assets/index-*.js 1,159.86 kB`
  2. `npm run bundle:server --workspace musecodeicon-desktop`
     → `src-tauri\resources\server.cjs 501.4kb`
  3. `npm run fetch:node --workspace musecodeicon-desktop`
     → `sidecar ready: ...\binaries\node-x86_64-pc-windows-msvc.exe`,
     `bundled Node.js v22.23.2 for x86_64-pc-windows-msvc`
- Rust release compile: 24–27s (incremental), 2 pre-existing warnings in
  `main.rs` (unused `OsString` import, line 8; needless `mut`, line 206) —
  cosmetic only, not errors
- NSIS: `Running makensis to produce ...\bundle\nsis\MuseCodeIcon_0.23.6_x64-setup.exe`
- Exit code: **0** (`BUILDEXIT:0`)

Note: the web workspace builds twice — once inside `beforeBuildCommand` and
once as the last workspace — because `musecodeicon-desktop build` is
`tauri build` and the root script builds all workspaces. Normal.

### Tauri build (standalone rerun)

```bash
cd apps/desktop
npx tauri build
```

Result: exit 0 (`TAURIEXIT:0`), same NSIS bundle. Full output:
`apps/desktop/tauri-build-rerun.log`.

### Artifacts

| Artifact | Size |
|----------|------|
| `apps/desktop/src-tauri/target/release/bundle/nsis/MuseCodeIcon_0.23.6_x64-setup.exe` | 28 MB |
| `apps/desktop/src-tauri/target/release/musecodeicon.exe` | 14 MB |

All build artifacts are gitignored (`**/target/`, `**/src-tauri/binaries/`,
`apps/desktop/.cache/`, `dist/`, `*.exe`): nothing of the above is committed.

## Step 6 — Tests (for reference only)

`npm run test --workspaces --if-present` (full log: `test.log`):

- `@musecodeicon/ui`: **369 pass, 0 fail**
- `daemon` 59/61: 2 WSL probe tests (depend on local WSL/muse install state)
- `server` 207/221: symlink EPERM (needs symlink privilege) + live-`muse` "fetch failed"
- `web` 52/52

None of the failures are caused by the rename.

## Step 7 — Smoke test

Launched `musecodeicon.exe` directly: window title `MuseCodeIcon`, server
`HTTP 200` on its run port with page `<title>MuseCodeIcon</title>`, no
splash/error pages. With `%LOCALAPPDATA%\Programs\muse` temporarily renamed
away, it still started: `/api/env` → `museFound: false`, `musePath: null`
(onboarding path). Test processes stopped and the muse install restored.

## Step 8 — Cleanup pass: removing what a desktop-only copy cannot use

A fresh-eyes pass over the copy deleted the parts of Helicon's codebase that exist
for hosts this build does not have. Net change: 37 files, 105 insertions, 2,925
deletions.

- **The hosted `/try` demo** (`apps/web/src/demo/tryPage.ts`, `tryAnalytics.ts`,
  `TryBanner.tsx`, `device.ts`, their three test files, the `build:try` script and
  the `tryHtml` Vite plugin). It builds a page for the landing site, which is not
  in this copy, and it was the only thing keeping `VITE_TRY` branches in
  `main.tsx`. The local demo client (`npm run dev:demo`) stays.
- **The updater**: `packages/ui/src/model/updates.ts` (the whole `UpdateManager`),
  `apps/web/src/updater.ts`, `controller.attachUpdater` and its
  check/download/restart/pref methods, the `updates`, `autoUpdate` and
  `updatesPaused` state, the Settings “Updates” section, the sidebar update menu
  and its dot, the palette commands, and two test files. With the Tauri plugin
  gone there was nothing left to drive any of it.
- **The editor-extension framing protocol** (`app/host.ts`, 345 lines): theme
  forwarding from a parent page, `postMessage` commands, the framed-page clipboard
  workaround, and `setEditorHosted`. All of it talked to an editor extension that
  is not part of this build. `copyText` survives on its own in
  `app/clipboard.ts`.
- **The compact panel layout** (`components/panel/Panel.tsx`, `app/panel.ts`,
  `--view=panel`): the editor side panel. With the host gone nothing could open
  it, and it was the only reason `Onboarding`, `BootError` and `ThreadView` had
  `compact`/`bare` variants — those are gone too, so each screen has one shape.
- **Small leftovers**: the “MuseCodeIcon is in your editor too” prefs flag, the
  `?host=editor`/`?theme=`/`?view=panel` URL options, `setExternalFileOpener`,
  the `@tauri-apps/plugin-updater` dependency, two Rust warnings (a split
  `node_candidates()` replaces the `mut` that was unused off Unix).

Verified after the cuts: `tsc --noEmit` clean for `packages/ui` and `apps/web`;
`npm run build` exit 0 with no Rust warnings; installer rebuilt
(`MuseCodeIcon_0.23.6_x64-setup.exe`, 27 MB); the app launched, its window titled
`MuseCodeIcon`, its server answered `<title>MuseCodeIcon</title>` and `/api/env`
reported `museFound: true, museSignedIn: true`. Tests: `@musecodeicon/ui`
369/369, `@musecodeicon/web` 52/52; `server` and `daemon` keep only their
environment-bound failures (symlink `EPERM` without developer mode, WSL probes).

## Reproducing from scratch

```bash
# from this folder:
npm install
npm run build
```

If the Rust build stops with `called Result::unwrap() on an Err value: Os { code: 5,
kind: PermissionDenied }` inside `tauri-build`, a copy of the app or its sidecar is still running and
holding `target/release/node.exe`. Close the app (or stop that node process) and build again.

That produces the NSIS installer. For macOS/Linux bundles, CI runners are
required: `.github/workflows/release.yml` at the repository root builds all three
OSes when a `v*` tag matching `tauri.conf.json` is pushed (or
`gh workflow run release.yml --ref vX.Y.Z`). Pushing a workflow file needs a token
with the `workflow` scope: `gh auth refresh -h github.com -s workflow`.

## Remaining release blockers

Resolved on 2026-11-24 by the first tagged CI run, [45359114370](https://github.com/yourbossdonpely/musecligui/actions/runs/45359114370): `v0.23.6` published the Windows NSIS installer, the universal macOS `.dmg`, and the Linux AppImage, `.deb` and `.rpm`, plus `SHA256SUMS`.

Two things had to change first. The macOS leg had never compiled: `main.rs` used `OsString` in its `cfg(unix)` PATH helpers without importing it, so Windows-only builds hid a Unix-only error (fixed in `4d9fa7d`). And Linux waited on macOS, so a macOS failure skipped it; it now waits only on Windows, which creates the release.

What still stands between this tree and a release people can trust unconditionally:

| Blocker | State | What clears it |
|---------|-------|----------------|
| Windows installer unsigned | Was: SmartScreen showed "Windows protected your PC" → More info → Run anyway | Cleared 0.23.8 as far as money allows: self-signed with the author cert (DigiCert timestamped), so SmartScreen names the publisher. Zero-warning needs a commercial OV/EV certificate |
| macOS build not notarized | `tauri.macos.conf.json` signs ad-hoc (`signingIdentity: "-"`, `hardenedRuntime: false`) | An Apple Developer ID plus notarization, before Gatekeeper opens it without "Open Anyway" |
| Draft releases cannot hold the tag | tauri-action looks releases up with `getReleaseByTag`, which 404s for drafts, then tries to create one and gets `422 already_exists` | Let the first CI run create the release; do not pre-create a draft for `v0.23.6` |
| No updater | Was: plugin removed, CI ran with `includeUpdaterJson: false` | Restored 0.23.8 with own `latest.json` feed + minisign key (`~/.tauri/musecodeicon.key`, pubkey in `tauri.conf.json`); CI needs the `TAURI_SIGNING_PRIVATE_KEY` secret for future runs |

Reproducing the Windows installer works locally with the commands above; macOS and Linux bundles come from the workflow, because neither can be cross-built on Windows (an Apple target fails at `objc2-exception-helper` before reaching this crate).

## Recent work (running log — newest last)

Standing rule: every finished piece of work gets written down here and in the READMEs as part of the work itself, so any other AI or person can follow along.

### v0.23.9 — update-check feedback, changelog link, author name

- Checking for updates toasts the result (up to date, or the error).
- The What's-new dialog's changelog link opens the release notes.
- Display name standardized to **MuseCodeIcon by Don PELY** (installer, window title, sidebar, docs).

### v0.23.10 — bridge GUI feature ports

Ported from the bridge GUI (`gui/`, `muse-bridge.js`) into the desktop app, adapted to its MSP architecture:

- **Follow-up chips** (`packages/ui/src/model/suggestions.ts`): model appends `[SUGGEST]`; transcript renders clickable chips; controller appends the suffix on plain sends only, display text stays clean.
- **@ mentions** (`model/mentions.ts`): composer caret tracking, directory listing/drill-down, file completion; file contents resolve onto the wire at send.
- **Checkpoints + undo**: no port — desktop per-file undo/review was already superior.
- **Share links**: `POST /api/shares` + public `GET /share/:id` (memory-only, unguessable ids); thread menu copies the link. The endpoint had to move out of the files sub-router (it 404'd there), and the server accepts the `assistant` role.
- **Compact**: no port — native Muse compaction was already end-to-end.
- **Parallel runs**: no port — per-session turns plus queue/steer/unqueue already cover it.
- **Read-aloud** (`model/speech.ts`, `app/speech.ts`): speaker button in the turn footer, Web Speech engine preferring a female English voice, Settings → Read aloud (voice, speed, test); sending or stopping ends playback.
- **Diagnostics** (`packages/server/src/diagnostics.ts`): Check syntax button on the files-changed card; node/JSON/py_compile/tsc/PowerShell checks, issues per file, honest skips; Windows CRLF tool output parses to the right line.
- **Task modes** (`model/modes.ts`): Build/Supervised/Plan/Research/Debug picker in the composer, per thread with a default; plan/research/debug frame prompts on the wire; fallback chips tune to the mode. Framing only — permissions untouched.
- Suites at release: UI 415, daemon 61, web 69, server 216 pass with 10 pre-existing Windows symlink-EPERM failures (proven on the clean tree).
- Release mechanics learned: the first `v0.23.10` run failed macOS/Linux at updater signing (`failed to decode secret key`) because the `TAURI_SIGNING_PRIVATE_KEY` repo secret was invalid; fixed by re-setting both secrets from `~/.tauri/musecodeicon.key` / `.pass` (validated first with `tauri signer sign` locally) and re-running. Note the key file on disk is base64 single-line and the password file has no trailing newline — set secrets with exact bytes.
- Known gap: Windows builds with `--no-sign`, which also skips updater signing, so `latest.json` has no Windows entry; Windows users install from the release page.

### v0.23.11 — delete thread, right-click menus, spelling

- **Delete thread** below Archive thread (sidebar + thread header), confirmed, danger-toned. The daemon deletes the session with turns/attachments/shell runs/usage and keeps a `deleted_sessions` tombstone so discovery never resurrects the host's copy; refused with 409 mid-turn. Muse itself keeps its session.
- **Right-click menus** on sidebar thread and project rows showing exactly the three-dots actions; item lists are shared components (`ThreadMenuItems`, `ProjectMenuItems`) with dropdown/right-click twins in `overlays.tsx`, so they cannot drift.
- Author spelling corrected to **Don PELY** in the top menu, titles, sidebar, installer copyright, LICENSE, changelogs and docs.
- Verified the 5-hour rolling-window pill already sits in the sidebar footer between Refresh and Usage.

### v0.30.0 — skill folders and routing

- **Skill folders** (`packages/server/src/skills.ts`): the daemon keeps user folders (`settings.skill_folders`) and always scans `~/.agents/skills`; every subfolder with a SKILL.md becomes a `folder:<name>` skill (frontmatter name/description, capped at 1000 per folder) merged into the catalog with Muse's own listing winning name clashes. Bodies serve through the existing skill endpoint, read straight from disk.
- **Management UI**: puzzle-piece button in the thread header (workspace skills to invoke, add-folder input, link to Settings) plus a Settings → Skills section (agents-folder status, folder list, routing toggle).
- **Routing** (`routeSkill` in `model/slash.ts`): plain prompts matching a folder skill (name ×3, description ×1, needs ≥3 with a strict winner) send with its instructions and a toast. Matching is synchronous so sends keep exact timing — an earlier async version hung the double-Enter test; only folder skills route since Muse loads its own itself.
- Test isolation lesson: server tests now run with an empty temp home, after the real machine's 12k-skill agents folder leaked into catalogs and crashed a run printing the diff.

### v1.1.0 — guided install, message Edit/Rollback

- **Guided install**: the setup screen's Muse steps grew an Install Muse button. `POST /api/env/install` runs Meta's official installer (PowerShell `irm|iex` on Windows, `curl|bash` elsewhere) through a 15-minute runner, then re-probes and returns the fresh environment. No redistribution — bytes come from Meta. Also fixed the server never passing its `home` option into the environment probe.
- **Edit**: sent messages offer Edit alongside Copy — an inline editor resends the revised text as a new turn (Enter sends, Esc cancels, IME-safe). Read-only threads keep copy only.
- **Rollback**: sent messages offer Rollback, which forks the session with a cut point through that turn (`session/fork` + `cutPoint.lastTurnId`, per the SDK spec) and opens the `(rollback)` branch; the original stays intact. Only finished turns roll back (the button disables mid-turn, and `forkBoundaryInvalid` explains otherwise).
- Test lesson: a failing controller test that throws before `stop()` leaves the runner hanging at teardown with workers idle — bisect with `--test-name-pattern` and look for the skipped cleanup.

## Unofficial notice

MuseCodeIcon is an unofficial community project. Not made, endorsed, or
supported by Meta; not affiliated with Meta. "Muse" and "Muse Code" are
trademarks of Meta, used here only to describe what this client connects to.
