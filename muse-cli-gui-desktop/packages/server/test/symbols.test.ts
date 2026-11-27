import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractSymbols, symbolSnippet } from "../src/symbols.js";

describe("symbols", () => {
  it("finds definitions across languages", () => {
    assert.deepEqual(
      extractSymbols("a.ts", "export async function run() {}\nconst x = 1;\nexport interface I {}\n").map((s) => s.name),
      ["run", "x", "I"],
    );
    assert.deepEqual(
      extractSymbols("a.py", "async def fetch():\n    pass\n\nclass Job:\n    pass\n").map((s) => `${s.kind}:${s.name}`),
      ["function:fetch", "class:Job"],
    );
    assert.deepEqual(
      extractSymbols("a.rs", "pub fn main() {}\nstruct S;\n").map((s) => s.name),
      ["main", "S"],
    );
    assert.deepEqual(
      extractSymbols("a.go", "func (s *S) Run() {}\ntype ID string\n").map((s) => s.name),
      ["Run", "ID"],
    );
    assert.deepEqual(
      extractSymbols("a.md", "# Title\n\ntext\n\n## Part\n").map((s) => `${s.kind}:${s.name}`),
      ["heading:Title", "heading:Part"],
    );
  });

  it("returns nothing for unknown languages and huge files", () => {
    assert.deepEqual(extractSymbols("a.css", ".x { color: red; }"), []);
    assert.deepEqual(extractSymbols("a.ts", `const a = 1;\n`.repeat(100000)), []);
  });

  it("dedupes repeat names and caps the list", () => {
    const many = Array.from({ length: 250 }, (_, i) => `function f${i % 10}() {}`).join("\n");
    const found = extractSymbols("a.ts", many);
    assert.ok(found.length <= 200);
    assert.deepEqual(
      found.map((s) => s.name),
      Array.from({ length: 10 }, (_, i) => `f${i}`),
    );
  });

  it("captures braced bodies and stops at the end", () => {
    const content = ["function a() {", "  if (x) {", "    go();", "  }", "}", "", "function b() {", "}"].join("\n");
    const [first] = extractSymbols("a.ts", content);
    assert.equal(symbolSnippet(content, first!), ["function a() {", "  if (x) {", "    go();", "  }", "}"].join("\n"));
  });

  it("captures indented bodies and decorators", () => {
    const content = ["@memo", "def run():", "    a = 1", "", "def other():", "    pass"].join("\n");
    const [first] = extractSymbols("a.py", content);
    assert.equal(symbolSnippet(content, first!), ["@memo", "def run():", "    a = 1"].join("\n"));
  });

  it("marks truncated snippets", () => {
    const content = `function big() {\n${"  x();\n".repeat(200)}}`;
    const [first] = extractSymbols("a.ts", content);
    const snippet = symbolSnippet(content, first!);
    assert.match(snippet, /\u2026\[truncated\]$/);
    assert.ok(snippet.length <= 8300);
  });
});
