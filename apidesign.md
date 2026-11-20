# Muse CLI GUI — API / Proxy Design (CLIProxyAPI research)

## What CLIProxyAPI is (researched 2026-11-20)
Source: https://github.com/router-for-me/CLIProxyAPI (MIT, Go).

- A local proxy server that turns CLI subscriptions into API endpoints: OpenAI-compatible
  (`/v1/chat/completions`, Responses), Claude-compatible, Gemini-compatible, Codex, Grok.
- Works by holding provider OAuth logins / API keys and translating API calls into provider
  requests: streaming + non-streaming, function calling, multimodal, multi-account
  round-robin, usage dashboards, management API, Go SDK for embedding.
- Clients (OpenCode, Cline, Copilot Chat, etc.) point at `http://127.0.0.1:PORT` with any key.
- **It already lists Muse Code support**: "Meta Muse models ... CLIProxyAPI supports Muse
  Code accounts through Meta login and Meta Model API keys."

## Key finding for us
Path A (try first, ~15 min, zero code): install CLIProxyAPI, add the Muse provider via
Meta login, point OpenCode at its local endpoint, see if the subscription works through it.
Caveat: our subscription key failed outside the official CLI (`client_attestation_denied`).
CLIProxyAPI's Meta channel most likely works with pay-per-use Model API keys; for a
SUBSCRIPTION login it may hit the same attestation wall. Worth one quick experiment
before building anything.

## Path B: our own proxy over `muse exec` (fallback, guaranteed compatible)
Why it would work: it drives the official CLI binary (no attestation issue — same trick
our GUI uses), wrapped in an OpenAI-compatible HTTP layer.

### Proposed endpoints (localhost only)
- `GET /v1/models` -> from `muse exec --list-models`.
- `POST /v1/chat/completions` (OpenAI schema: model, messages[], stream)
  - Build one prompt: system + transcript (user/assistant turns) -> `--prompt-file`.
  - Run `muse exec --json --model ...`; non-streaming returns final text as one choice;
    streaming relays `run.output.delta` as SSE `data:` chunks.
- Auth: required local bearer key (`MUSE_API_KEY`), bind 127.0.0.1 only.
- Safety: workspace allowlist (refuse cwd outside approved roots), per-hour prompt budget.

### OpenCode wiring (pattern; confirm against installed OpenCode version)
Custom OpenAI-compatible provider pointing at `http://127.0.0.1:8766/v1` with the local
key, model `muse-spark-1.3`. Then OpenCode treats the subscription as a model backend.

### Risks (read before building)
1. **Account/ToS risk**: Meta locks subscriptions to the official CLI for a reason.
   Proxying it elsewhere may violate terms and could flag the account. Local-only,
   personal-use only; never expose publicly or share.
2. **Allowance burn**: 10-50 prompts/5h. One OpenCode agent loop = many turns = the
   window can die in minutes. The proxy needs hard budgets + the GUI usage bar.
3. **Power**: an HTTP API that runs an agentic CLI is RCE-as-a-service. Localhost +
   key + root-jail are mandatory, not optional.
4. **Fidelity**: each API call = one single-shot agent run (transcript stuffed into the
   prompt). No native OpenAI function-calling passthrough; the CLI does its own tools
   internally. Fine for chat; heavy for tight agentic loops.

### Effort if approved
~400 lines (HTTP layer + translation + guards) + protocol tests + OpenCode live test.
CLI flags: `--api` / `MUSE_API_PORT` (default off), `MUSE_API_KEY` (required to enable).

## Decision log
- [ ] Try CLIProxyAPI Muse channel first? (user decision)
- [ ] Build our own proxy? (user decision after A)