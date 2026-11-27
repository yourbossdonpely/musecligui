// Session handoff: export a thread to a portable Markdown file and resume it on
// another machine. The file is human-readable Markdown with a fenced JSON block
// that carries the machine-readable transcript; the parser only trusts that
// block, so hand-edited prose around it never corrupts an import. Caps mirror
// the share endpoint (200 turns, 50k chars a side, 1MB total).
import type { LocalEcho, TurnView } from "./fold.js";
import { stripSuggestions } from "./suggestions.js";

/** First line of every handoff file; its absence means "not one of ours". */
export const HANDOFF_MARKER = "<!-- musecodeicon-handoff v1 -->";
const DATA_FENCE = "```json handoff-data";
const MAX_TURNS = 200;
const MAX_SIDE_CHARS = 50000;
const MAX_FILE_CHARS = 1_000_000;
/** Opening context when a handoff resumes; first turn plus newest turns win. */
const RESUME_BUDGET = 24000;

export interface HandoffTurn {
  prompt: string;
  reply: string;
  /** Why the turn failed, when it did instead of replying. */
  error?: string;
}

export interface HandoffData {
  version: 1;
  title: string;
  cwd: string;
  modelId: string | null;
  exportedAt: string;
  turns: HandoffTurn[];
}

function clean(text: string): string {
  return text.replace(/\r\n?/g, "\n").slice(0, MAX_SIDE_CHARS);
}

/**
 * Turns with neither side are running shells and notices: not transcript, not exported.
 * Local echoes ride along as prompt-only turns: queued and in-flight messages the
 * transcript has not seen yet are still part of the thread being handed off.
 */
export function handoffTurns(views: TurnView[], echoes: LocalEcho[] = []): HandoffTurn[] {
  const turns: HandoffTurn[] = [];
  for (const view of views.slice(0, MAX_TURNS)) {
    const prompt = clean(view.prompt?.displayText ?? view.prompt?.text ?? "").trim();
    const reply = clean(stripSuggestions(view.final?.text ?? "")).trim();
    if (!prompt && !reply) {
      continue;
    }
    const turn: HandoffTurn = { prompt, reply };
    const failure = view.info?.error;
    if (view.info?.terminal === "failed" && failure) {
      turn.error = `${failure.kind}: ${failure.message}`.slice(0, 500);
    }
    turns.push(turn);
  }
  for (const echo of echoes) {
    if (turns.length >= MAX_TURNS) {
      break;
    }
    const prompt = clean(echo.text).trim();
    if (prompt) {
      turns.push({ prompt, reply: "" });
    }
  }
  return turns;
}

export function buildHandoffMarkdown(meta: {
  title: string;
  cwd: string;
  modelId: string | null;
  exportedAt: string;
  turns: HandoffTurn[];
}): string {
  const data: HandoffData = { version: 1, ...meta };
  const lines = [
    HANDOFF_MARKER,
    `# ${meta.title || "Untitled thread"}`,
    "",
    `- Project: \`${meta.cwd}\``,
    `- Model: \`${meta.modelId ?? "unknown"}\``,
    `- Exported: ${meta.exportedAt}`,
    `- Turns: ${meta.turns.length}`,
    "",
  ];
  meta.turns.forEach((turn, index) => {
    lines.push(`## Turn ${index + 1} — user`, "", turn.prompt || "_(no prompt)_", "");
    lines.push(`## Turn ${index + 1} — assistant`, "", turn.reply || "_(no reply)_", "");
    if (turn.error) {
      lines.push(`> Failed: ${turn.error}`, "");
    }
  });
  lines.push(DATA_FENCE, JSON.stringify(data), "```", "");
  return lines.join("\n").slice(0, MAX_FILE_CHARS);
}

function fail(fileName: string, why: string): never {
  throw new Error(`${fileName || "That file"} is not a thread export (${why}).`);
}

/** Parses a handoff file back, refusing anything that is not one, loudly. */
export function parseHandoffFile(fileName: string, text: string): HandoffData {
  const source = String(text ?? "");
  if (source.length > MAX_FILE_CHARS * 2) {
    fail(fileName, "over 2MB");
  }
  if (!source.startsWith(HANDOFF_MARKER)) {
    fail(fileName, "missing handoff marker");
  }
  const fence = source.indexOf(DATA_FENCE);
  const end = fence < 0 ? -1 : source.indexOf("```", fence + DATA_FENCE.length);
  if (fence < 0 || end < 0) {
    fail(fileName, "missing data block");
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(source.slice(fence + DATA_FENCE.length, end)) as Record<string, unknown>;
  } catch {
    fail(fileName, "broken data block");
  }
  if (data!.version !== 1 || !Array.isArray(data!.turns)) {
    fail(fileName, "unknown version");
  }
  const turns: HandoffTurn[] = [];
  for (const raw of (data!.turns as unknown[]).slice(0, MAX_TURNS)) {
    const turn = (raw ?? {}) as Record<string, unknown>;
    const prompt = String(turn.prompt ?? "").slice(0, MAX_SIDE_CHARS);
    const reply = String(turn.reply ?? "").slice(0, MAX_SIDE_CHARS);
    if (!prompt && !reply) {
      continue;
    }
    turns.push({ prompt, reply, ...(typeof turn.error === "string" && turn.error ? { error: turn.error.slice(0, 500) } : {}) });
  }
  if (!turns.length) {
    fail(fileName, "no turns inside");
  }
  return {
    version: 1,
    title: String(data!.title ?? "Imported thread").slice(0, 120) || "Imported thread",
    cwd: String(data!.cwd ?? ""),
    modelId: typeof data!.modelId === "string" ? data!.modelId : null,
    exportedAt: String(data!.exportedAt ?? ""),
    turns,
  };
}

/**
 * The opening message that resumes a handoff: first turn for setup, then the
 * newest turns until the budget runs out, back in chronological order. The echo
 * stays a one-liner while the wire carries the transcript.
 */
export function buildResumeMessage(handoff: HandoffData): { text: string; displayText: string; trimmed: boolean } {
  const picked: HandoffTurn[] = [];
  let used = 0;
  const ordered = handoff.turns.length > 1 ? [handoff.turns[0]!, ...handoff.turns.slice(1).reverse()] : [...handoff.turns];
  for (const turn of ordered) {
    const size = turn.prompt.length + turn.reply.length;
    if (picked.length > 0 && used + size > RESUME_BUDGET) {
      break;
    }
    picked.push(turn);
    used += size;
  }
  picked.sort((a, b) => handoff.turns.indexOf(a) - handoff.turns.indexOf(b));
  const trimmed = picked.length < handoff.turns.length;
  const parts = [
    `[Context from the earlier thread "${handoff.title}" — ${handoff.turns.length} turns, attached for reference.`,
    trimmed ? "Older middle turns were trimmed to fit; the first and newest remain.]" : "Nothing was trimmed.]",
    "",
  ];
  picked.forEach((turn, index) => {
    parts.push(`Turn ${index + 1} — user:`, turn.prompt || "_(no prompt)_", "", `Turn ${index + 1} — assistant:`, turn.reply || "_(no reply)_", "");
  });
  parts.push("Continue this work. Acknowledge briefly and await my next instruction.");
  const count = `${handoff.turns.length} turn${handoff.turns.length === 1 ? "" : "s"}`;
  return {
    text: parts.join("\n"),
    displayText: `Resumed "${handoff.title}" (${count})`,
    trimmed,
  };
}
