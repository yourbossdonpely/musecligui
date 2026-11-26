// Follow-up suggestion chips. The controller asks the model to end every reply
// with a [SUGGEST] block; the transcript parses it into clickable chips and
// strips it from the displayed text. Zero extra model calls. When the model
// omits the block, generic fallback chips fill in.
import { modeFallbackSuggestions, type TaskMode } from "./modes.js";

export const SUGGEST_SUFFIX =
  "\n\n[After your reply, end with exactly 3 short follow-up suggestions, one per line, " +
  "inside a [SUGGEST]...[/SUGGEST] block. Each suggestion must read as a concrete next " +
  "message the user could send (under 100 characters). Do not explain the block.]";

const BLOCK_RE = /\[SUGGEST\]([\s\S]*?)\[\/SUGGEST\]/;

export function parseSuggestions(text: string): string[] {
  const m = String(text ?? "").match(BLOCK_RE);
  if (!m) {
    return [];
  }
  return m[1]
    .split("\n")
    .map((line) => line.replace(/^[\s>*-]+/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter((line) => line.length > 1)
    .slice(0, 3)
    .map((line) => (line.length > 120 ? `${line.slice(0, 117)}...` : line));
}

export function stripSuggestions(text: string): string {
  return String(text ?? "")
    .replace(BLOCK_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const FALLBACKS = ["Review the diff of these changes", "Run the tests to verify this", "Explain what changed and why"];

/** First prompts for an empty thread: one tap fills the composer, never sends. */
export const STARTER_PROMPTS = [
  "Explain what this project does",
  "Review my recent changes",
  "Find bugs and dead code",
];

/** Generic chips when a reply carries none; a task mode tunes them to what the thread is doing. */
export function fallbackSuggestions(mode?: TaskMode): string[] {
  if (mode === "plan" || mode === "research" || mode === "debug") {
    return modeFallbackSuggestions(mode);
  }
  return [...FALLBACKS];
}
