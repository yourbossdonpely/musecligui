# Contributing to MuseCodeIcon

Thanks for helping. MuseCodeIcon is an open-source desktop and web app for Meta's Muse Code CLI, built with Tauri, React and TypeScript. You don't need a Muse Code subscription to work on most of it: demo mode runs the whole interface on sample data.

## Before you start

The app lives in this folder (`muse-cli-gui-desktop/`) of the [yourbossdonpely/musecligui](https://github.com/yourbossdonpely/musecligui) repository. Every workspace and every command below is rooted here, so clone and then change into this folder.

The repository has no issues and no pull-request template yet. For anything bigger than a small fix, [open an issue](https://github.com/yourbossdonpely/musecligui/issues/new) saying what you want to change and which files you expect to touch, so the shape can be agreed before you write code. There is no triage rota: one maintainer reviews when they get to it, and nothing is assigned to anyone in advance.

## Set up (about 5 minutes)

You need Node 22 or newer and git. If you use NVM, run `nvm use` from this folder after installing and configuring NVM to activate the Node.js version specified by `.nvmrc`. Rust and the Tauri prerequisites are only needed for the desktop shell.

```bash
git clone https://github.com/<you>/musecligui && cd musecligui/muse-cli-gui-desktop
nvm use
npm install
npm run build --workspace @musecodeicon/daemon --workspace @musecodeicon/ui --workspace @musecodeicon/server
```

### Work on the UI without Muse (demo mode)

```bash
npm run dev:demo --workspace @musecodeicon/web
# open http://localhost:5173
```

Demo mode swaps the server for an in-memory client with sample projects, threads, an approval waiting, usage and models. Sending a message plays back a scripted turn. Edits to `packages/ui` hot-reload. This is the right setup for almost every UI issue.

### Run against a real Muse

If you have the `muse` CLI and have run `muse login` once:

```bash
# terminal 1: the API, talking to your muse (needs the build above)
node packages/server/dist/src/cli.js --port 3127
# terminal 2: the UI with hot reload
npm run dev --workspace @musecodeicon/web
# open http://localhost:5173
```

### The desktop app

```bash
npm run dev --workspace musecodeicon-desktop
```

Needs [the Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS. `npm run build --workspace musecodeicon-desktop` produces the release binary and, on Windows, the installer under `apps/desktop/src-tauri/target/release/bundle/nsis/`.

## Where things live

| Path | What it is |
|---|---|
| `packages/ui` | The whole interface, shared by desktop and web. State in `src/model`, components in `src/components`. Reusable UI goes here, not in `apps/*` |
| `packages/server` | The local HTTP + SSE API the UI talks to |
| `packages/daemon` | Runs `muse serve` and speaks MSP (JSON-RPC over stdio) through `@muse-code/sdk` |
| `apps/web` | The Vite entry for the browser build, plus demo mode (`src/demo`) |
| `apps/desktop` | The Tauri 2 shell (Rust) and installers |
| `docs/assets` | Screenshots used by the README |

`BUILD-LOG.md` records what was copied from upstream, what was removed, and the build and test results of this copy.

## Tests

Run these for the workspaces you touched. None of them need a Muse login.

```bash
npm run test --workspace @musecodeicon/ui       # 369 tests, about 12 s
npm run test --workspace @musecodeicon/web      # 52 tests, about 9 s
npm run test --workspace @musecodeicon/server   # 222 tests
npm run test --workspace @musecodeicon/daemon   # 61 tests
```

Two environment notes from measuring this on Windows, so a red suite does not send you hunting for a bug:

- Ten `packages/server` file-viewer tests fail with `EPERM` when Node cannot create symlinks (a Developer Mode or elevated shell normally can). Everything else in that suite passes.
- The `packages/daemon` WSL probe has two tests that assert what is installed on the machine; they disagree with a machine that has the Windows `muse` installed, or a WSL default distro that differs from the one they assume.

There is no test CI in this copy. The only workflow is `.github/workflows/release.yml` at the repository root: it builds the Windows, macOS and Linux installers on a `v*` tag and runs no tests, so run them yourself before you open a PR. For the desktop crate, also run:

```bash
cd apps/desktop/src-tauri && cargo check && cargo test
```

For UI changes, check light and dark themes and a narrow window, and add a screenshot or short clip to the PR.

## What gets merged

- One change per PR, linked to an issue where there is one, with tests where the change has logic in it.
- Commit subjects are short and plain, and say what changed: `Keep focus in the sidebar after renaming a project`. Add a body only when the "why" isn't obvious.
- Typo-only PRs, and generated changes the author clearly did not run or read, are closed. Using AI tools is fine; understanding and testing what you submit is on you.
- No release has been published yet. When the first one is, merged contributors are named by handle in its notes.

## Ground rules

1. The README says MuseCodeIcon is an unofficial community project, not affiliated with Meta; keep it to that note and don't repeat it in names, releases, docs or the app. App UI stays unbranded.
2. Don't use the `Muse` mark in new binary names, bundle IDs, domains or titles.
3. Never commit credentials (`auth.json`, `.env`, API keys). Use your own `muse login`.
4. Never bypass approvals or billing. Surface approval modes honestly.
5. Security problems go to a [private report](https://github.com/yourbossdonpely/musecligui/security/advisories/new) if the repository's Security tab offers one, not to a public issue.

Everyone here is expected to be civil and to assume good faith.

## Versioning

Semver. The app updates itself from `latest.json` on each GitHub release (check on launch and every six hours, install on close when automatic updates are on), so a release is a `v*` tag that builds the installers for all three platforms — or a hand-built installer and a bumped version in `apps/desktop/src-tauri/tauri.conf.json`. Routine work never bumps major; merged PRs with considerable work bump at least the patch version. The maintainer cuts releases. Update bundles are signed with the minisign key in `~/.tauri/musecodeicon.key`, whose public half lives in `tauri.conf.json`; the same private key must be set as the `TAURI_SIGNING_PRIVATE_KEY` repo secret or CI cannot publish `latest.json`.
