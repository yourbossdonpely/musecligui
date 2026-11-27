// Review passes and their follow-through. A review turn is recognized by its
// prompt head, which doubles as the marker the transcript looks for when
// offering to apply the findings - no turn ids to track across reloads.
import type { TurnView } from "./fold.js";

/** Every review prompt starts here, so replies to one are recognizable. */
export const REVIEW_PROMPT_HEAD = "Review these changed files";

export function buildReviewPrompt(paths: string[]): string {
  return `${REVIEW_PROMPT_HEAD} for bugs, risks and nits, most important first:\n${paths.map((path) => `- ${path}`).join("\n")}`;
}

/** Sends the model back over its own review, file by file. */
export const APPLY_REVIEW_PROMPT =
  "Address each finding from your review above, working file by file. Fix what you flagged as bugs or risks; note anything you deliberately leave alone.";

/** True when the turn asked for a review, whatever followed the head. */
export function isReviewTurn(turn: TurnView): boolean {
  const prompt = turn.prompt?.displayText ?? turn.prompt?.text ?? "";
  return prompt.startsWith(REVIEW_PROMPT_HEAD);
}
