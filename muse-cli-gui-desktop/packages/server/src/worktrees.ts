// Git worktree management: list, add, remove and prune isolated checkouts so
// threads can run apart from the main tree. All commands run through the
// workspace shell runner, which already routes Windows/WSL correctly; branch
// names are validated to a strict subset first, so they can never escape the
// command line they ride in.

export interface WorktreeEntry {
  path: string;
  /** Short branch name; null when detached or bare. */
  branch: string | null;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  lockReason: string | null;
  /** Why the entry is stale (its folder is gone); null when healthy. */
  prunable: string | null;
  head: string | null;
}

/** Parses `git worktree list --porcelain` output; blank-line separated stanzas. */
export function parseWorktreeList(stdout: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  const flush = () => {
    if (current) {
      entries.push(current);
      current = null;
    }
  };
  for (const raw of String(stdout ?? "").split("\n")) {
    const line = raw.trimEnd();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("worktree ")) {
      flush();
      current = { path: line.slice("worktree ".length), branch: null, bare: false, detached: false, locked: false, lockReason: null, prunable: null, head: null };
    } else if (!current) {
      continue;
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length) || null;
    } else if (line === "bare") {
      current.bare = true;
    } else if (line === "detached") {
      current.detached = true;
    } else if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length);
      current.branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
    } else if (line === "locked") {
      current.locked = true;
    } else if (line.startsWith("locked ")) {
      current.locked = true;
      current.lockReason = line.slice("locked ".length) || null;
    } else if (line.startsWith("prunable ")) {
      current.prunable = line.slice("prunable ".length) || "gone";
    }
  }
  flush();
  return entries.filter((entry) => entry.path.length > 0);
}

/**
 * Branch names the app will put on a command line: letters, digits and `._/-`,
 * within git's own rules (no `..`, no leading dash/dot/slash, no trailing
 * slash/dot, no `.lock`, no `@{`). Returns the problem, or null when clean.
 */
export function branchProblem(name: string): string | null {
  const branch = String(name ?? "").trim();
  if (!branch) {
    return "Name a branch.";
  }
  if (branch.length > 200) {
    return "That branch name is too long.";
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(branch)) {
    return "Letters, digits and . _ / - only.";
  }
  if (
    branch.startsWith("-") ||
    branch.startsWith("/") ||
    branch.startsWith(".") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.endsWith(".lock") ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.includes("@{")
  ) {
    return "That is not a valid branch name.";
  }
  return null;
}

/** The folder a branch gets under `.worktrees/`: lowercased, everything else a dash. */
export function worktreeDirName(branch: string): string {
  const slug =
    branch
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "worktree";
  return slug;
}
