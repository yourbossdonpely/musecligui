import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { branchProblem, parseWorktreeList, worktreeDirName } from "../src/worktrees.js";

describe("worktrees", () => {
  it("parses porcelain stanzas", () => {
    const entries = parseWorktreeList(
      [
        "worktree /repo",
        "HEAD abc123",
        "branch refs/heads/main",
        "",
        "worktree /repo/.worktrees/feat",
        "HEAD def456",
        "branch refs/heads/feat",
        "locked busy",
        "",
        "worktree /repo/.worktrees/old",
        "HEAD 000000",
        "detached",
        "prunable directory gone",
        "",
      ].join("\n"),
    );
    assert.equal(entries.length, 3);
    assert.deepEqual(entries[0], {
      path: "/repo",
      branch: "main",
      bare: false,
      detached: false,
      locked: false,
      lockReason: null,
      prunable: null,
      head: "abc123",
    });
    assert.equal(entries[1]?.locked, true);
    assert.equal(entries[1]?.lockReason, "busy");
    assert.equal(entries[2]?.detached, true);
    assert.equal(entries[2]?.prunable, "directory gone");
  });

  it("skips junk and empty paths", () => {
    assert.deepEqual(parseWorktreeList(""), []);
    assert.deepEqual(parseWorktreeList("branch refs/heads/x\n"), []);
  });

  it("accepts sane branches and refuses the rest", () => {
    assert.equal(branchProblem("feat/login"), null);
    assert.equal(branchProblem("  v2.0_fix  "), null);
    for (const bad of ["", "has space", "../escape", "-dash", ".dot", "trail/", "a.lock", "a@{b}", "x//y", "semi;colon"]) {
      assert.ok(branchProblem(bad), bad);
    }
  });

  it("slugs branches into folder names", () => {
    assert.equal(worktreeDirName("Feat/Login_Page"), "feat-login-page");
    assert.equal(worktreeDirName("!!!"), "worktree");
  });
});
