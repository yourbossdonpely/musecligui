# Muse CLI GUI — the bridge GUI (older app)

The portable Windows GUI + WebSocket bridge for the `muse` CLI. Unchanged since
MuseCodeIcon took over; it lives on here for the machines still running it.

**Docs:** everything is in the [root README](../README.md#muse-cli-gui--the-bridge-gui-older) —
features, launchers, quick start, OpenCode/FreeBuff wiring, development, troubleshooting.
Start there. `READ-ME-FIRST.txt` in this folder is the two-line version.

Layout (all paths relative to this folder):

| Path | What it is |
|------|------------|
| `MuseCLIGUI.exe` | One-click launcher (needs `muse-bridge.js` + `gui/` beside it) |
| `muse-bridge.js` | The bridge server (`ws://localhost:8765` + OpenAI-compatible `:8766/v1`) |
| `gui/` | React GUI source; `gui/dist/` is the committed single-file build the exe opens |
| `muse-gui.html` | Legacy single-file GUI, kept as a fallback |
| `tests/` | Bridge protocol suite (`npm install`, then `npm run test:bridge`) |
| `setup.ps1` | First-run setup brain (Node.js, deps, API key, OpenCode wiring) |
| `launch-muse-gui.bat`, `start-bridge.cmd`, `stop-bridge.cmd` | Portable launchers |
| `muse-full.cmd`, `opencode.cmd` | Muse CLI / OpenCode shims |
| `Launcher.cs` | Launcher source (rebuild with `csc.exe`, then re-sign) |
| `wire-opencode-projects.js` | One-shot OpenCode project-folder wiring |
| `opencode-plugin-muse-cwd/`, `opencode-agents/` | `muse-cwd` plugin + supervised/research/debug agents |
| `docs/screenshots/`, `assets/` | GUI screenshots and launcher art |
| `apidesign.md`, `uiredesign.md` | Bridge-era design notes |

This folder is self-contained: copy or move it anywhere and it runs from there.
