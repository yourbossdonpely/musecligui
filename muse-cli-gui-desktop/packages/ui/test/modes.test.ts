import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTaskMode, modeFallbackSuggestions, modePromptPrefix, TASK_MODES, type TaskMode } from "../src/model/modes.js";

describe("task modes", () => {
  it("names five modes with labels", () => {
    assert.deepEqual(Object.keys(TASK_MODES), ["build", "supervised", "plan", "research", "debug"]);
    for (const mode of Object.keys(TASK_MODES) as TaskMode[]) {
      assert.ok(TASK_MODES[mode].label, `${mode} has a label`);
      assert.ok(TASK_MODES[mode].desc, `${mode} has a description`);
    }
  });

  it("frames plan, research and debug prompts and leaves build alone", () => {
    assert.equal(modePromptPrefix("build"), "");
    assert.equal(modePromptPrefix("supervised"), "");
    assert.match(modePromptPrefix("plan"), /^MODE: You are in READ-ONLY PLANNING mode\./);
    assert.match(modePromptPrefix("research"), /^MODE: Deep-research mode\./);
    assert.match(modePromptPrefix("debug"), /^MODE: Debugging\./);
    assert.ok(modePromptPrefix("plan").endsWith("\n\n"));
  });

  it("tunes fallback chips to the mode", () => {
    assert.equal(modeFallbackSuggestions("plan")[0], "Turn this plan into numbered build steps");
    assert.equal(modeFallbackSuggestions("research")[0], "Go deeper on the first finding");
    assert.equal(modeFallbackSuggestions("debug")[0], "Run the reproduction again to confirm");
    assert.equal(modeFallbackSuggestions("build")[0], "Review the diff of these changes");
    assert.equal(modeFallbackSuggestions("supervised")[0], "Review the diff of these changes");
  });

  it("validates saved modes", () => {
    assert.equal(isTaskMode("debug"), true);
    assert.equal(isTaskMode("custom"), false);
    assert.equal(isTaskMode(null), false);
    assert.equal(isTaskMode(42), false);
  });
});
