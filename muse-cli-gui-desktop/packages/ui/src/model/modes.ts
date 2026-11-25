/** What Muse is doing in a thread: the task framing. Permissions stay separate, governed by approval modes, YOLO and the sandbox. */
export type TaskMode = "build" | "supervised" | "plan" | "research" | "debug";

export function isTaskMode(value: unknown): value is TaskMode {
  return value === "build" || value === "supervised" || value === "plan" || value === "research" || value === "debug";
}

export const TASK_MODES: Record<TaskMode, { label: string; desc: string }> = {
  build: { label: "Build", desc: "Full speed: just ask." },
  supervised: { label: "Supervised", desc: "The agent acts freely; approvals and the sandbox stay as set." },
  plan: { label: "Plan", desc: "Read-only exploration. Muse plans but writes nothing and runs nothing that changes state." },
  research: { label: "Research", desc: "Deep research with web tools. Answers come back with cited sources." },
  debug: { label: "Debug", desc: "Fix mode: reproduce, find the root cause, fix small, then verify." },
};

/** The instruction a mode adds ahead of a plain prompt on the wire; the transcript keeps the clean text. */
export function modePromptPrefix(mode: TaskMode): string {
  if (mode === "plan") {
    return "MODE: You are in READ-ONLY PLANNING mode. Explore the codebase and propose a concrete plan. Do not modify any files and do not run shell commands that change state.\n\n";
  }
  if (mode === "research") {
    return "MODE: Deep-research mode. Use your web tools to research thoroughly. Answer with findings and cite sources as URLs for key claims.\n\n";
  }
  if (mode === "debug") {
    return "MODE: Debugging. Reproduce the reported issue, find the root cause, apply the smallest correct fix, then verify with tests or a reproduction. Explain what was wrong.\n\n";
  }
  return "";
}

/** Follow-up chips when a reply carries none of its own, tuned to what the thread is doing. */
export function modeFallbackSuggestions(mode: TaskMode): string[] {
  if (mode === "plan") {
    return ["Turn this plan into numbered build steps", "What are the risks in this plan?", "Estimate the size of each step"];
  }
  if (mode === "research") {
    return ["Go deeper on the first finding", "Compare the top two options", "Find counter-arguments to this"];
  }
  if (mode === "debug") {
    return ["Run the reproduction again to confirm", "Add a regression test for this", "Explain the root cause simply"];
  }
  return ["Review the diff of these changes", "Run the tests to verify this", "Explain what changed and why"];
}
