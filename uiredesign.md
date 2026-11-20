# Muse CLI GUI — UI Redesign Log (v3)

## Research (2026-11-20)

Sources: OpenCode desktop changelog/docs, Cline UI codebase notes, Antigravity platform writeups, plus the apps installed on this machine (OpenCode, FreeBuff, Antigravity, Trae).

| App | Patterns worth stealing |
|-----|-------------------------|
| **OpenCode** | Minimal refined dark surfaces; tabbed sessions; command palette; composer-first layout (big centered input card); attachment cards; review panel with persistent file browsing; appearance customization |
| **Cline** | ThinkingBlock (expandable thinking-trace row, 240ms ease open/close); tool panels as expandable rows sharing one markdown pipeline; subtle checkpoint indicator line that expands on hover; syntax-highlighted diffs; streaming markdown |
| **Antigravity** | Agent-first surfaces: Editor + Manager (dashboard observing agents); artifacts; task-oriented flows; agents plan -> execute -> verify across editor/terminal/browser |
| **FreeBuff/Trae** | Chat-first IDE sidebars; per-tool status rows; model picker in the composer |

### Adopted UX language
- **Thinking block**: gradient orb icon + pulsing label + elapsed timer; narrates live activity ("Running read_file…"); collapses to "Thought for Xs" when done (Cline-style).
- **Typed tool cards**: icon chip + color per tool family (read/write/terminal/search/web/model), status pill (running/done/failed), elapsed time, click to expand raw details; completed cards auto-collapse to one line.
- **Terminal card**: distinct `$ command` treatment with mono output block.
- **Markdown answers**: safe escape-first renderer (code blocks with language + copy, bold/italic, headers, lists, links).
- **Checkpoint divider**: subtle timestamped line after each run with changed-file count, expands to the file list (Cline-style).
- **Composer card**: OpenCode-style input card (mode pills + model chip + attach + send/stop).
- **Real folder picker**: the file browser complaint is really "no way to SELECT a folder" (browsers cannot open native pickers from file://). Fix: bridge-driven picker (drives -> navigate -> select) in Add/Edit Project, backed by a new `fs-drives` bridge action.
- **Dual subscription bars**: window AND weekly each get a progress bar + reset text.
- **Skills filter**: 147 skills need a text filter.
- **Welcome hero**: empty state with quick actions instead of a bare hint.

## Hook contract (must stay stable for the E2E suite)
All existing element IDs, CSS hook classes (`.tool-call`, `.bubble.muse`, `.typing`, `.file-node`, `.model-row[data-model]`, `.mode-card`, `#permsPreview`, etc.) and `window.*` functions keep working. The v2 E2E suite must pass unchanged against the redesign.

## Work log
- [x] 2026-11-20: research done, this file created.
- [x] Bridge: `fs-drives` action (drives B:-G: + Home verified live).
- [x] GUI v3 rewrite (theme, thinking, tool cards, markdown, checkpoints, picker, bars, hero).
- [x] Verify: 29 protocol + 21 v2-E2E regression + 4 refusal + 19 v3 UI tests, all green.

## Verification (2026-11-20)
- Old 21-test E2E suite passes UNCHANGED against the redesign (hook contract held).
- New v3 suite: markdown renderer (head/bold/code/fence/list/link/XSS-escape), hero, picker drives+select, project save, edit modal, skill filter, weekly bar, thinking block, typed tool card, thought summary, tool done pill, checkpoint divider.
- Two test-harness bugs found and fixed along the way (async save race, md prelude); no app bugs in v3.