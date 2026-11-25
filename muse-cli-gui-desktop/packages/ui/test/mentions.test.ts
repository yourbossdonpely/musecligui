import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyMention,
  buildMentionContext,
  extractMentions,
  findMentionToken,
  splitMentionQuery,
} from "../src/model/mentions.js";

describe("mentions", () => {
  it("finds a token at the caret", () => {
    assert.deepEqual(findMentionToken("@a", 2), { start: 0, query: "a" });
    assert.deepEqual(findMentionToken("see @sr", 7), { start: 4, query: "sr" });
  });

  it("rejects emails and mid-word @", () => {
    assert.equal(findMentionToken("a@b", 3), null);
    assert.equal(findMentionToken("x@y z", 3), null);
  });

  it("returns null without a token or inside a word", () => {
    assert.equal(findMentionToken("hello", 5), null);
    assert.equal(findMentionToken("@ab cd", 2), null);
  });

  it("splits dir and file parts", () => {
    assert.deepEqual(splitMentionQuery("a"), { dir: "", file: "a" });
    assert.deepEqual(splitMentionQuery("src/ut"), { dir: "src", file: "ut" });
  });

  it("applies a mention with a trailing space", () => {
    assert.deepEqual(applyMention("see @a", 6, 4, "a.txt"), { value: "see @a.txt ", caret: 11 });
  });

  it("extracts unique rels, trimming punctuation", () => {
    assert.deepEqual(extractMentions("see @a.txt and @b.js, also @a.txt!"), ["a.txt", "b.js"]);
  });

  it("builds a fenced context block", () => {
    const block = buildMentionContext([{ rel: "a.txt", content: "hi" }]);
    assert.match(block, /File @a\.txt:/);
    assert.match(block, /```/);
    assert.equal(buildMentionContext([]), "");
  });
});
