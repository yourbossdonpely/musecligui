import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HANDOFF_MARKER,
  buildHandoffMarkdown,
  buildResumeMessage,
  handoffTurns,
  parseHandoffFile,
  type HandoffTurn,
} from "../src/model/handoff.js";
import type { TurnView } from "../src/model/fold.js";

function view(over: Partial<TurnView> & { key: string }): TurnView {
  const { key, ...rest } = over;
  return {
    key,
    turnId: null,
    prompt: null,
    entries: [],
    final: null,
    after: [],
    info: null,
    running: false,
    ...rest,
  };
}

function item(text: string, extra: Record<string, unknown> = {}) {
  return {
    itemId: `i-${text.length}`,
    kind: "x",
    status: "done",
    revision: 1,
    text,
    ...extra,
  };
}

describe("handoff", () => {
  it("extracts prompts and cleaned replies, skipping empty turns", () => {
    const turns = handoffTurns([
      view({ key: "a", prompt: item("do it", { displayText: "do it" }), final: item("done\n\n[SUGGEST]\nx\n[/SUGGEST]") }),
      view({ key: "b" }),
    ]);
    assert.deepEqual(turns, [{ prompt: "do it", reply: "done" }]);
  });

  it("carries local echoes as prompt-only turns", () => {
    const turns = handoffTurns([], [{ localId: "l1", text: "waiting", turnId: null, disposition: "queued", createdAt: 0 }]);
    assert.deepEqual(turns, [{ prompt: "waiting", reply: "" }]);
  });

  it("round-trips markdown back into data", () => {
    const md = buildHandoffMarkdown({
      title: "Fix bug",
      cwd: "C:/proj",
      modelId: "m1",
      exportedAt: "2026-11-27T00:00:00.000Z",
      turns: [{ prompt: "a", reply: "b" }],
    });
    assert.ok(md.startsWith(HANDOFF_MARKER));
    assert.match(md, /## Turn 1 — user/);
    const back = parseHandoffFile("x.md", md);
    assert.equal(back.title, "Fix bug");
    assert.deepEqual(back.turns, [{ prompt: "a", reply: "b" }]);
  });

  it("refuses files that are not exports", () => {
    for (const [name, text] of [
      ["plain.md", "# hello"],
      ["empty.md", `${HANDOFF_MARKER}\n# t\n`],
      ["broken.md", `${HANDOFF_MARKER}\n\`\`\`json handoff-data\n{nope\`\`\`\n`],
      ["noturns.md", `${HANDOFF_MARKER}\n\`\`\`json handoff-data\n{"version":1,"turns":[]}\`\`\`\n`],
    ] as const) {
      assert.throws(() => parseHandoffFile(name, text), /is not a thread export/);
    }
  });

  it("builds a resume message that keeps setup plus newest", () => {
    const turns: HandoffTurn[] = Array.from({ length: 5 }, (_, i) => ({
      prompt: `p${i} ${"x".repeat(9000)}`,
      reply: `r${i}`,
    }));
    const resume = buildResumeMessage({ version: 1, title: "T", cwd: "", modelId: null, exportedAt: "", turns });
    assert.equal(resume.displayText, 'Resumed "T" (5 turns)');
    assert.equal(resume.trimmed, true);
    assert.match(resume.text, /p0/);
    assert.match(resume.text, /p4/);
    assert.doesNotMatch(resume.text, /p2/);
  });

  it("keeps every turn when nothing needs trimming", () => {
    const resume = buildResumeMessage({
      version: 1,
      title: "T",
      cwd: "",
      modelId: null,
      exportedAt: "",
      turns: [{ prompt: "a", reply: "b" }],
    });
    assert.equal(resume.trimmed, false);
    assert.match(resume.text, /Nothing was trimmed/);
  });
});
