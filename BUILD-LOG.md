# Build Log — MuseCodeIcon desktop app

How the `muse-cli-gui-desktop/` app was assembled, renamed and built, so the
installer can be reproduced from a clean checkout. Project-level log; the
desktop folder has its own copy of the details in
[`muse-cli-gui-desktop/BUILD-LOG.md`](muse-cli-gui-desktop/BUILD-LOG.md).

Everything below was run on Windows (Git Bash), Node v22.23.4, npm 10.9.9,
Rust/Cargo 1.99.0.

---

## 1. What was copied from Helicon (MIT)

Upstream: <https://github.com/HarjjotSinghh/helicon> — MIT, Copyright 2026
Harjot Singh Rana and contributors. The `LICENSE` file is kept unchanged in
`muse-cli-gui-desktop/`.

Only the desktop pieces were taken (247 files), extracted with `git archive`
from upstream HEAD `7c04087` (Release 0.23.6):

- `apps/web` — React UI
- `apps/desktop` — Tauri 2 shell, sidecar scripts, icons
- `packages/daemon`, `packages/server`, `packages/ui`
- root npm files (`package.json`, `package-lock.json`, `tsconfig.base.json`,
  `.editorconfig`, `.nvmrc`), `LICENSE`, `README.md`, `CONTRIBUTING.md`

Deliberately **not** copied: the landing site, the VS Code extension, the docs
guides. The scratch clone used for the copy was deleted afterwards.

## 2. Rename to MuseCodeIcon

Bulk rename over 95 files, then targeted fixes:

| From | To |
|------|----|
| `@helicon/*` | `@musecodeicon/*` |
| `helicon-desktop` | `musecodeicon-desktop` |
| `com.helicon.desktop` (identifier) | `com.musecodeicon.desktop` |
| `helicon://` (events) | `musecodeicon://` |
| `HELICON_*` (env vars) | `MUSECODEICON_*` |
| "Helicon" in product name, window title, splash page, error pages | "MuseCodeIcon" |
| `HeliconApp.tsx` | `MuseCodeIconApp.tsx` |
| `Helicon{Controller,Client,Store,MspHost,Error,Event}` | `MuseCodeIcon…` |

Also: repo links point at `github.com/yourbossdonpely/musecodeicon` (the
repository name is kept as-is — it is not the product name), the README gained
the **unofficial / not affiliated with Meta** notice, and the sidebar's
"MuseCodeIcon is in your editor too" card was deleted because this copy ships
no editor extension and would link to a listing that does not exist.

## 3. Updater removed

Helicon ships an in-app updater pointing at `helicon.sh` and Helicon's GitHub
releases — a renamed build would silently pull *their* updates. Removed
entirely, before the rename:

- `apps/web/src/model/updates.ts`, `apps/web/src/updater.ts` — the update manager and
  the shell hookup deleted, with the Settings/command-palette/footer rows they fed
- `apps/desktop/src-tauri/src/main.rs` — `.plugin(tauri_plugin_updater…)` removed
- `apps/desktop/src-tauri/Cargo.toml` — `tauri-plugin-updater` dependency removed
- `apps/desktop/src-tauri/capabilities/main.json` — `updater:default` removed
- `apps/desktop/src-tauri/tauri.conf.json` — `plugins.updater` and
  `createUpdaterArtifacts` removed

Consequence, stated in both READMEs: **the app never checks for updates and
makes no telemetry calls**. New versions are installed by hand.

## 4. Branding: icon and the dark-and-gold default

- Icon source art: `muse-cli-gui-desktop/apps/desktop/assets/make-icon.py` (Pillow) draws
  `icon-source.png` — a gold geometric M with a spark on a near-black tile — which is also the
  mark the in-app `<Logo>` draws. Expanded for every platform with:
  `cd muse-cli-gui-desktop/apps/desktop && python assets/make-icon.py && npx tauri icon assets/icon-source.png`
  → `src-tauri/icons/` (`.ico`, `.icns`, PNGs, Store/Square, Android, iOS).
  Verified embedded in the built exe via
  `[System.Drawing.Icon]::ExtractAssociatedIcon(...)`.
- Default theme is `"dark"` (`packages/ui/src/model/store.ts`), and the
  pre-paint script in `apps/web/index.html` sets `data-theme="dark"` unless
  saved prefs say otherwise — no light flash on a light-mode OS.
- Accent family is gold: `--accent: oklch(0.845 0.152 87)` on near-black
  (`--bg: oklch(0.112 0.008 78)`, sidebar `oklch(0.078 0.007 78)`), with near-black text on
  gold and gold-tinted borders. The Tauri window is built with
  `.theme(Some(tauri::Theme::Dark))` and `.background_color(Color(10, 8, 6, 255))`, and the
  splash/error pages are hard-coded dark, so no OS preference can show the app light.
  Light mode keeps the same gold accent.

## 5. Windows fix: `fetch-node` and GNU tar

`apps/desktop/scripts/fetch-node.mjs` downloads Node.js v22.23.2 as the Tauri
sidecar and unpacks it with `tar`. On a machine with Git Bash first on `PATH`
the build failed:

```
downloading https://nodejs.org/dist/v22.23.2/node-v22.23.2-win-x64.zip
tar: Cannot connect to C: resolve failed
Error: Command failed: tar -xf C:\…\node-v22.23.2-win-x64.zip …
  status: 128
```

Bare `tar` resolved to GNU tar 1.35, which reads a `C:\…` path as a remote
archive host. Fix: on Windows, use the system bsdtar explicitly.

```js
const tarCmd =
  process.platform === "win32"
    ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe")
    : "tar";
```

After the fix the sidecar lands correctly and the build continues. Do not
revert this.

## 6. Build commands and results

```bash
cd muse-cli-gui-desktop
npm install          # exit 0
npm run build        # exit 0
```

`npm run build` runs every workspace. `musecodeicon-desktop`'s build is
`tauri build`, whose `beforeBuildCommand` does the real work:

1. `npm run build --workspace @musecodeicon/web` — `tsc` + `vite build`,
   `✓ 5490 modules transformed`
2. `npm run bundle:server --workspace musecodeicon-desktop` —
   `src-tauri\resources\server.cjs 501.4kb`
3. `npm run fetch:node --workspace musecodeicon-desktop` —
   `sidecar ready: …\binaries\node-x86_64-pc-windows-msvc.exe`,
   `bundled Node.js v22.23.2 for x86_64-pc-windows-msvc`
4. Rust release compile (~25 s incremental) and NSIS packaging

Observed artifacts:

| Output | Size |
|--------|------|
| `apps/desktop/src-tauri/target/release/bundle/nsis/MuseCodeIcon_0.23.6_x64-setup.exe` | 27–28 MB |
| `apps/desktop/src-tauri/target/release/musecodeicon.exe` | 14 MB |

Two pre-existing Rust warnings in `main.rs` (unused `OsString` import, needless
`mut`) — cosmetic, left as upstream had them.

**Known build failure and fix:** if Rust stops with
`called Result::unwrap() on an Err value: Os { code: 5, kind: PermissionDenied }`
inside `tauri-build`, a copy of the app or its sidecar `node.exe` is still
running and holding `target/release/node.exe`. Close the app / stop that
process, then rebuild.

## 7. Tests

`npm run test --workspaces --if-present`:

- `@musecodeicon/ui` — **369 pass, 0 fail**
- `@musecodeicon/daemon` — 59/61 (2 WSL-probe tests depend on local WSL state)
- `@musecodeicon/server` — 207/221 (symlink-EPERM tests need symlink privilege;
  "fetch failed" tests need a live `muse` server)
- `@musecodeicon/web` — **52 pass, 0 fail**

None of the failures come from the rename or the rebrand.

## 8. Smoke test

Launched `musecodeicon.exe`: window title `MuseCodeIcon`, local server answered
`HTTP 200` with `<title>MuseCodeIcon</title>`, no splash/error page, only the
normal `ExperimentalWarning: SQLite` in the server log. With the `muse` install
temporarily renamed away it still started and reported
`museFound: false, musePath: null` (first-run onboarding), then the install was
restored.

## 9. What is *not* built

- **macOS and Linux bundles**: not produced here (Windows-only machine). They come
  from `.github/workflows/release.yml` on GitHub's runners: tag `v0.23.6` (matching
  `tauri.conf.json`) and the three OS jobs publish the installer, the universal `.dmg`
  and the Linux AppImage/.deb/.rpm plus a `SHA256SUMS` file.
- **Code signing / notarization**: none. SmartScreen and Gatekeeper warnings
  are expected on first launch.
- **Published releases**: none. There are no tags or release assets for
  MuseCodeIcon.

## 9. Cleanup pass (desktop-only scope)

Once the copy was building, a review removed the parts of Helicon that exist only
for hosts this build does not have — 37 files, 105 insertions, 2,925 deletions:

| Removed | Why |
|---------|-----|
| Hosted `/try` demo: `demo/tryPage.ts`, `tryAnalytics.ts`, `TryBanner.tsx`, `device.ts`, 3 test files, `build:try`, the Vite `tryHtml` plugin | It builds a page for the landing site, which is not in this copy |
| The updater: `model/updates.ts`, `apps/web/src/updater.ts`, `attachUpdater`, the `updates`/`autoUpdate`/`updatesPaused` state, Settings and sidebar rows, palette items, 2 test files | The Tauri updater plugin is gone, so nothing could drive it |
| The editor-extension protocol: `app/host.ts` theme forwarding, `postMessage` commands, framed-page clipboard, `setEditorHosted` | Nothing frames this app; no extension ships in this copy |
| The compact panel layout: `components/panel/Panel.tsx`, `app/panel.ts`, `?view=panel`, the `compact`/`bare` screen variants | It was the editor side panel; unreachable without a host |
| Leftovers: the editor-tip pref, `?host=editor`/`?theme=` options, `setExternalFileOpener`, `@tauri-apps/plugin-updater`, two Rust warnings | Dead once the host and updater were gone |

`copyText` moved to `apps/web`-side `packages/ui/src/app/clipboard.ts` and keeps
the plain clipboard API. Details are in
[`muse-cli-gui-desktop/BUILD-LOG.md`](muse-cli-gui-desktop/BUILD-LOG.md).

After the cuts: `tsc --noEmit` clean for both packages, `npm run build` exit 0
with no Rust warnings, installer rebuilt (27 MB), app launched and served
`<title>MuseCodeIcon</title>` with `/api/env` reporting `museFound: true` and
`museSignedIn: true`. Tests: ui 369/369, web 52/52; server and daemon keep only
their environment-bound failures (symlink `EPERM` without developer mode, WSL
probes).

## 10. Reproducing

```bash
cd muse-cli-gui-desktop
npm install
npm run build
```

The installer appears under `apps/desktop/src-tauri/target/release/bundle/nsis/`.
All build output is gitignored (`**/target/`, `**/src-tauri/binaries/`,
`apps/desktop/.cache/`, `dist/`, `*.exe`).

## 11. Repo renamed to musecodeicon; bridge GUI moved to bridge-gui/

After v3.0.0 the repo itself was renamed `musecligui` → `musecodeicon`
(`gh repo rename`; GitHub redirects the old web/git URLs, and the updater feed
keeps working through the redirect). All `yourbossdonpely/musecligui`
references were updated to the new path — docs, the Tauri updater endpoint in
`tauri.conf.json`, in-app links, and tests — while the `MuseCLIGUI.exe`
launcher binary name is unchanged.

The older bridge GUI was moved out of the repo root into `bridge-gui/` with
`git mv` (history kept): `muse-bridge.js`, `muse-gui.html`, `Launcher.cs` +
`MuseCLIGUI.exe`, the `.bat`/`.cmd`/`.ps1` launchers, `READ-ME-FIRST.txt`,
`package.json`/`package-lock.json`, `apidesign.md`/`uiredesign.md`, and the
`gui/`, `tests/`, `docs/`, `assets/`, `opencode-agents/`, and
`opencode-plugin-muse-cwd/` folders. The whole subtree moved intact, so its
internal relative paths still resolve; only the root README's bridge section
needed `bridge-gui/` prefixes. Root now holds the README, LICENSE, this log,
`.github/`, `muse-cli-gui-desktop/`, and `bridge-gui/`.

---

MuseCodeIcon is an unofficial community project: not made, endorsed, or
supported by Meta, and not affiliated with Meta.
