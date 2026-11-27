import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileIconTone, folderTone } from "../src/model/fileicons.js";

describe("fileicons", () => {
  it("colors common languages by convention", () => {
    assert.match(fileIconTone("app.js", true), /text-yellow-600/);
    assert.match(fileIconTone("app.ts", true), /text-blue-600/);
    assert.match(fileIconTone("app.py", true), /text-green-600/);
    assert.match(fileIconTone("main.rs", true), /text-stone-500/);
    assert.match(fileIconTone("main.go", true), /text-teal-600/);
    assert.match(fileIconTone("App.java", true), /text-red-600/);
  });

  it("colors data, docs and web files distinctly", () => {
    assert.match(fileIconTone("data.json", false), /text-amber-600/);
    assert.match(fileIconTone("README.md", false), /text-sky-600/);
    assert.match(fileIconTone("index.html", false), /text-orange-600/);
    assert.match(fileIconTone("app.css", false), /text-cyan-600/);
    assert.match(fileIconTone("app.scss", false), /text-fuchsia-600/);
    assert.match(fileIconTone("run.sh", true), /text-emerald-600/);
  });

  it("colors media by kind", () => {
    assert.match(fileIconTone("shot.png", false), /text-pink-600/);
    assert.match(fileIconTone("clip.mp4", false), /text-rose-600/);
    assert.match(fileIconTone("take.mp3", false), /text-violet-600/);
    assert.match(fileIconTone("doc.pdf", false), /text-red-600/);
  });

  it("prefers exact names and quiets unknown dotfiles", () => {
    assert.match(fileIconTone("Dockerfile", false), /text-blue-600/);
    assert.match(fileIconTone("Makefile", true), /text-red-600/);
    assert.match(fileIconTone(".gitignore", false), /text-orange-600/);
    assert.equal(fileIconTone(".envrc", false), "text-subtle");
    assert.equal(fileIconTone("notes.txt", false), "text-subtle");
  });

  it("falls back to a code tone or quiet generic", () => {
    assert.match(fileIconTone("weird.zzz", true), /text-sky-600/);
    assert.equal(fileIconTone("weird.zzz", false), "text-subtle");
    assert.match(fileIconTone("UPPER.TS", true), /text-blue-600/);
  });

  it("paints folders gold and purposes by name", () => {
    assert.match(folderTone("src"), /text-amber-600/);
    assert.match(folderTone("anything-at-all"), /text-amber-600/);
    assert.match(folderTone(".git"), /text-orange-600/);
    assert.match(folderTone("API"), /text-sky-600/);
    assert.match(folderTone("server"), /text-violet-600/);
    assert.match(folderTone("scripts"), /text-emerald-600/);
    assert.match(folderTone("config"), /text-slate-500/);
    assert.match(folderTone("docs"), /text-blue-600/);
    assert.match(folderTone("tests"), /text-green-600/);
    assert.match(folderTone("assets"), /text-pink-600/);
    assert.match(folderTone("components"), /text-cyan-600/);
    assert.match(folderTone("dist"), /text-stone-500/);
    assert.equal(folderTone("node_modules"), "text-subtle");
    assert.equal(folderTone(".vscode"), "text-subtle");
  });

  it("ships a dark pair with every tone", () => {
    for (const tone of [fileIconTone("a.ts", true), folderTone("src")]) {
      assert.match(tone, /dark:text-\w+-400/);
    }
  });
});
