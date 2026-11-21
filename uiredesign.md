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


---

# Phase 2: React rebuild (2026-11-20) — design record

## Intent and why
The v3 restyle kept the old structure and still reads as the same app. Rebuild the
GUI as a genuinely new, modern agent console (OpenCode/Cline-grade) in React, while
keeping the user's one-click run (exe/zip) and all saved data working.

## Goals / non-goals / anti-goals
- Goals: new visual system; component architecture; full feature parity with v3;
  previously deferred safe items (session import, MCP add/remove, slash commands,
  send queue, checkpoint diff view); committed tests; committed dist/.
- Non-goals: in-GUI file editor (user chose agent-edits), full browser tab
  (user chose preview+research), checkpoint restore (destructive; needs explicit ask),
  parallel runs (queue instead), command palette, mobile-first.
- Anti-goals: anything that breaks one-click run (no dev server needed by users);
  losing saved projects/settings; purple-SaaS generic look.

## Approaches considered
1. **React + Vite + Tailwind, singlefile dist (CHOSEN, user approved).** Real
   components, modern polish, testable; I absorb the build step, dist/ committed.
2. Radical single-file restyle (dropped: two passes proved diminishing returns).
3. Next.js/Electron shell (dropped: server runtime / 100MB+ wrapper kill one-click
   simplicity; browser + exe launcher already covers distribution).

## Decisions
- User picks: React rebuild; OpenCode-like modern direction.
- Builder calls: TypeScript; Tailwind v4; vite-plugin-singlefile; hand-rolled
  shadcn-style primitives (no radix tree: lean offline dist, testable DOM);
  vitest + testing-library; bridge protocol unchanged (old GUI keeps working);
  localStorage keys unchanged (data migrates); dist/ committed.

## Design system (frontend-design skill)
- Tokens: bg #0B0C0E, surface #131417, raised #1B1E24, line #262A33,
  text #F2F0EA, dim #A8A29A, muted #6E6A63, accent amber #E8A33D.
  Status: green #4ADE80, red #F87171, info #7DD3FC.
- Type: system sans (Inter-first) for UI; ui-monospace stack for code/data.
  No webfonts (offline zip must work).
- Layout: 3-column agent console (264px rail / conversation max-w 880 /
  320px inspector), docked composer card, slim footer status.
- Principles: warm precision instrument; narration-first (agent always says
  what it is doing); quiet surfaces, one amber voice; motion answers actions
  only; keyboard-first (Enter/Esc); reduced-motion respected.
- Uniqueness check: amber-on-warm-black + narration spine is not the
  purple-SaaS default nor the acid/vermilon cliche; OpenCode gives the
  minimal bones, Cline gives the activity language.

## Wireframe
```
+--------+--------------------------------+--------+
| brand  |  conversation (scroll)         | tabs:  |
| PROJ   |  user msg (right, amber tint)  | Files/ |
|  tree  |  thinking orb + narration+time | Browser|
| SKILLS |  tool cards (icon/status/time) | More   |
| filter |  markdown answer (streaming)   |        |
| USAGE  |  thought summary + checkpoint  |        |
| bars   +--------------------------------+--------+
|        |  composer: modes|model|input   |        |
+--------+--------------------------------+--------+
| footer: bridge . model . mode . tokens . usage  |
+------------------------------------------------+
```

## Test seams (tdd skill)
1. lib unit (markdown, protocol builders, storage+migration, modes) — vitest node.
2. Component/integration (rendered UI + MockBridge) — testing-library.
3. E2E (rendered UI + REAL stub-backed bridge) — testing-library + ws.
4. dist smoke (built file mounts + key flows) + tsc + vite build gates.

## Slices (incremental skill: implement->test->verify->commit each)
- S0 scaffold+tokens+build+harness green. S1 lib+unit tests. S2 shell+sidebar.
- S3 chat+composer+exec E2E. S4 thinking/tools/checkpoints/markdown. S5 right
  panels. S6 modals+picker+skills+usage+perms+models. S7 deferred+bridge adds.
  S8 packaging (dist/exe/zip) + full verify.

## Skills applied this phase
brainstorming (this record + approaches), 21st-ui-explore (direction contract),
frontend-design (system above), frontend-ui-engineering (composition, tokens,
a11y, states), beautiful-ui (thinking/tool/composer patterns), shadcn (rules:
gap, cn, Badge/Empty/Skeleton/Separator, ToggleGroup, dialog titles, chat
composition), tdd (seams + red-green), verification-before-completion (gates),
incremental-implementation (slices + commits).

## Work log
- [x] 2026-11-20: direction set, this record written + self builder-checked.
## Work log
- [x] 2026-11-20: research done, this file created.
- [x] Bridge: `fs-drives` action (drives B:-G: + Home verified live).
- [x] GUI v3 rewrite (theme, thinking, tool cards, markdown, checkpoints, picker, bars, hero).
- [x] Verify: 29 protocol + 21 v2-E2E regression + 4 refusal + 19 v3 UI tests, all green.

## Verification (2026-11-20)
- Old 21-test E2E suite passes UNCHANGED against the redesign (hook contract held).
- New v3 suite: markdown renderer (head/bold/code/fence/list/link/XSS-escape), hero, picker drives+select, project save, edit modal, skill filter, weekly bar, thinking block, typed tool card, thought summary, tool done pill, checkpoint divider.
- Two test-harness bugs found and fixed along the way (async save race, md prelude); no app bugs in v3.
## Phase 2 completion (2026-11-20)
- Slices S0–S7 all landed, each verified (vitest + tsc + build + E2E) and committed separately.
- Final tally: 68 unit/component tests, 5 E2E (stub bridge), 30 protocol tests, 6 dist-bundle execution checks — all green.
- Deferred verdicts kept: in-GUI editor + full browser tab excluded (user chose agent-edits / preview+research earlier); checkpoint restore excluded (destructive, needs explicit ask); parallel runs replaced by send queue.
- Skills applied: brainstorming (design record), 21st-ui-explore (direction contract), frontend-design (amber token system + wireframe), frontend-ui-engineering (composition, semantic tokens, a11y floor, states), beautiful-ui (thinking/tool/composer patterns), shadcn (gap/cn/Badge/Empty/Skeleton/ToggleGroup/dialog rules, chat composition), tdd (seams + red-green), verification-before-completion (gates), incremental-implementation (slices + commits).
- Full skill library cataloged (136 entries); task-relevant skills deep-read and applied.

## OpenCode-look restyle (2026-11-21)
- Extracted REAL dark tokens from the installed OpenCode desktop bundle (app.asar main-*.css): bg #101010/#161616/#242424, border #282828, text #fafafa/#aeaeae/#808080, accent blue #3b5cf6 / #a2bcff, Inter + IBM Plex Mono, 8px scrollbar.
- Remapped gui/src/index.css @theme to those tokens (token names kept, so every component inherits); converted all solid amber fills to the blue accent (send, primary buttons, switch, progress/usage bars, logos, thinking orb); zero amber left in src.
- Added the missing rendered-markdown CSS (.md-code blocks with lang header + copy, inline code, links, live cursor) and live-run keyframes (orb-spin, shimmer, pulse-dot) with reduced-motion guards.
- Fixed the dangling Sub % row (folded into the composer status bar) found during screenshot review.
- Verified: tsc clean, 75/75 vitest, dist rebuilt, real-Chrome screenshots reviewed (welcome + composer states, live bridge connected). No DOM/testid/behavior changes.
