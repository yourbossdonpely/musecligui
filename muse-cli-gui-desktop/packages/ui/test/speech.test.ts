import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickVoice, speechText } from "../src/model/speech.js";

describe("speech", () => {
  it("collapses code blocks to spoken placeholders", () => {
    assert.ok(speechText("See:\n```js\nconst a = 1;\nconst b = 2;\n```").includes("Code block, 2 lines, js."));
  });

  it("strips markdown formatting", () => {
    assert.equal(speechText("# Hi\n\n**bold** and `code` and [link](https://x)"), "Hi\n\nbold and code and link");
  });

  it("strips suggest blocks and quotes", () => {
    assert.equal(speechText("> quoted\n[SUGGEST]\na\n[/SUGGEST]"), "quoted");
  });

  it("picks the preferred female english voice", () => {
    const voices = [
      { name: "Microsoft David", lang: "en-US", voiceURI: "david" },
      { name: "Microsoft Zira", lang: "en-US", voiceURI: "zira" },
      { name: "Google Deutsch", lang: "de-DE", voiceURI: "de" },
    ];
    assert.equal(pickVoice(voices)?.voiceURI, "zira");
    assert.equal(pickVoice(voices, "david")?.voiceURI, "david");
    assert.equal(pickVoice([]), null);
  });

  it("prefers natural online voices on ties", () => {
    const voices = [
      { name: "Microsoft Guy", lang: "en-US", voiceURI: "guy" },
      { name: "Microsoft Aria Online (Natural)", lang: "en-US", voiceURI: "aria" },
    ];
    assert.equal(pickVoice(voices)?.voiceURI, "aria");
  });
});
