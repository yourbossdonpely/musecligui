import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyEvents, emptyFold } from "../src/model/fold.js";
import { shareMessages } from "../src/model/shares.js";
import type { MspItem, ViewEvent } from "../src/types.js";

function item(partial: Partial<MspItem> & { itemId: string; kind: string }): ViewEvent {
  return {
    method: "item/completed",
    params: { sessionId: "s", item: { status: "completed", revision: 1, ...partial } },
  };
}

describe("shareMessages", () => {
  it("collects prompts and replies in stream order", () => {
    const fold = applyEvents(emptyFold(), [
      item({ itemId: "u1", kind: "userMessage", text: "Fix the footer" }),
      item({ itemId: "a1", kind: "agentMessage", text: "Fixed." }),
      item({ itemId: "u2", kind: "userMessage", text: "Thanks" }),
      item({ itemId: "a2", kind: "agentMessage", text: "Anytime." }),
    ]);
    assert.deepEqual(shareMessages(fold), [
      { role: "user", text: "Fix the footer" },
      { role: "assistant", text: "Fixed." },
      { role: "user", text: "Thanks" },
      { role: "assistant", text: "Anytime." },
    ]);
  });

  it("shares the clean prompt text, not what the model got", () => {
    const fold = applyEvents(emptyFold(), [
      item({ itemId: "u1", kind: "userMessage", text: "Fix it @/src/big.ts <file content>", displayText: "Fix it @/src/big.ts" }),
    ]);
    assert.deepEqual(shareMessages(fold), [{ role: "user", text: "Fix it @/src/big.ts" }]);
  });

  it("leaves tool rows, notices and retracted prompts out", () => {
    const fold = applyEvents(emptyFold(), [
      item({ itemId: "u1", kind: "userMessage", text: "gone", retracted: true }),
      item({ itemId: "t1", kind: "toolCall", tool: "shell", text: "ls" }),
      item({ itemId: "n1", kind: "systemNotice", text: "restarted" }),
      item({ itemId: "a1", kind: "agentMessage", text: "   " }),
      item({ itemId: "a2", kind: "agentMessage", text: "Here." }),
    ]);
    assert.deepEqual(shareMessages(fold), [{ role: "assistant", text: "Here." }]);
  });

  it("is empty for a thread with no conversation yet", () => {
    assert.deepEqual(shareMessages(emptyFold()), []);
  });
});
