import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { APPLY_REVIEW_PROMPT, REVIEW_PROMPT_HEAD, buildReviewPrompt, isReviewTurn } from "../src/model/review.js";
import type { TurnView } from "../src/model/fold.js";

function turn(prompt: string | null): TurnView {
  return {
    key: "t1",
    turnId: "t1",
    prompt: prompt === null ? null : { itemId: "u1", kind: "userMessage", status: "completed", revision: 1, text: prompt },
    entries: [],
    final: null,
    after: [],
    info: null,
    running: false,
  };
}

describe("review", () => {
  it("builds the review prompt with its files", () => {
    assert.equal(
      buildReviewPrompt(["a.ts", "b.ts"]),
      `${REVIEW_PROMPT_HEAD} for bugs, risks and nits, most important first:\n- a.ts\n- b.ts`,
    );
  });

  it("recognizes review turns by their prompt head", () => {
    assert.equal(isReviewTurn(turn(`${REVIEW_PROMPT_HEAD} for bugs:\n- a.ts`)), true);
    assert.equal(isReviewTurn(turn("fix the bug")), false);
    assert.equal(isReviewTurn(turn(null)), false);
  });

  it("asks for fixes file by file", () => {
    assert.match(APPLY_REVIEW_PROMPT, /file by file/);
    assert.match(APPLY_REVIEW_PROMPT, /deliberately leave alone/);
  });
});
