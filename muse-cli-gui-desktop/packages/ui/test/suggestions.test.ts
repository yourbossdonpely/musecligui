import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SUGGEST_SUFFIX, fallbackSuggestions, parseSuggestions, stripSuggestions } from "../src/model/suggestions.js";

describe("suggestions", () => {
  it("parses a well-formed block", () => {
    const text = "Done.\n[SUGGEST]\nReview the diff\nRun the tests\nExplain why\n[/SUGGEST]";
    assert.deepEqual(parseSuggestions(text), ["Review the diff", "Run the tests", "Explain why"]);
  });

  it("strips bullets, numbers and caps at three", () => {
    assert.deepEqual(parseSuggestions("[SUGGEST]\n- one\n2. two\n* three\n4) four\n[/SUGGEST]"), ["one", "two", "three"]);
  });

  it("returns empty without a block", () => {
    assert.deepEqual(parseSuggestions("plain reply"), []);
  });

  it("strip removes the block and collapses gaps", () => {
    assert.equal(stripSuggestions("Done.\n\n[SUGGEST]\na\n[/SUGGEST]\n\nThanks."), "Done.\n\nThanks.");
  });

  it("strip leaves plain text alone", () => {
    assert.equal(stripSuggestions("hello"), "hello");
  });

  it("fallbacks always offer three", () => {
    assert.equal(fallbackSuggestions().length, 3);
  });

  it("suffix instructs the model", () => {
    assert.match(SUGGEST_SUFFIX, /\[SUGGEST\]/);
  });
});
