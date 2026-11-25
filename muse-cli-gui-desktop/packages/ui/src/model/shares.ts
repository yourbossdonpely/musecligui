import { HIDDEN_KINDS, type ThreadFold } from "./fold.js";

export interface ShareMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * The thread's conversation as plain turns for a share page: prompts as the user wrote them
 * (`displayText`, the clean form the transcript shows) plus Muse's replies, in stream order.
 * Tool rows, approvals and other work-log entries stay out, like the bridge share page.
 */
export function shareMessages(fold: ThreadFold): ShareMessage[] {
  const out: ShareMessage[] = [];
  for (const id of fold.order) {
    const item = fold.items.get(id);
    if (!item || HIDDEN_KINDS.has(item.kind)) {
      continue;
    }
    if (item.kind === "userMessage") {
      if (item.retracted) {
        continue;
      }
      const text = item.displayText ?? item.text ?? "";
      if (text.trim()) {
        out.push({ role: "user", text });
      }
    } else if (item.kind === "agentMessage") {
      const text = item.text ?? "";
      if (text.trim()) {
        out.push({ role: "assistant", text });
      }
    }
  }
  return out;
}
