import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Logo } from "../src/components/ui/primitives.js";

describe("Logo", () => {
  it("draws the current MuseCodeIcon mark — the gold M and spark on black — not Helicon's", () => {
    const markup = renderToStaticMarkup(createElement(Logo, { size: 32 }));
    assert.match(markup, /M7\.44 23\.7/, "the M's left leg is missing");
    assert.match(markup, /#FCECBE/, "the gold gradient is missing");
    assert.match(markup, /fill="#0C0A07"/, "the black tile is missing");
    assert.doesNotMatch(markup, /M 619\.9 322/, "Helicon's mark is still in the logo");
    assert.doesNotMatch(markup, /<circle/, "a retired dot is still in the logo");
  });
});
