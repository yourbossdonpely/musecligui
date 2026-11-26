export interface McpServerView {
  name: string;
  /** `stdio`, `streamable-http`, or whatever newer Muse reports. */
  type: string;
  enabled: boolean;
  /** Where it is defined: `user`, `project`, or whatever newer Muse reports. */
  source: string;
  /** HTTP servers only. */
  url: string | null;
  /** stdio servers only. */
  command: string | null;
  args: string[];
}

/** One line the UI shows under the name: the URL, or the command with its arguments. */
export function mcpDetail(server: McpServerView): string {
  if (server.url) {
    return server.url;
  }
  if (server.command) {
    return [server.command, ...server.args].join(" ");
  }
  return server.type;
}

/**
 * Parses `muse mcp list --json` (`{"servers":[...]}`). Lenient by design: unknown shapes and
 * nameless entries are skipped, and a body that is not that JSON yields null.
 */
export function parseMcpList(stdout: string): McpServerView[] | null {
  let root: unknown;
  try {
    root = JSON.parse(stdout) as unknown;
  } catch {
    return null;
  }
  const list = (root as { servers?: unknown } | null)?.servers;
  if (!Array.isArray(list)) {
    return null;
  }
  const out: McpServerView[] = [];
  for (const entry of list) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const name = typeof record["name"] === "string" ? record["name"].trim() : "";
    if (!name) {
      continue;
    }
    const args = Array.isArray(record["args"]) ? record["args"].filter((a): a is string => typeof a === "string") : [];
    out.push({
      name,
      type: typeof record["type"] === "string" && record["type"] ? record["type"] : "unknown",
      enabled: record["enabled"] !== false,
      source: typeof record["source"] === "string" && record["source"] ? record["source"] : "user",
      url: typeof record["url"] === "string" ? record["url"] : null,
      command: typeof record["command"] === "string" ? record["command"] : null,
      args,
    });
  }
  return out;
}

/** What `muse mcp add` accepts as a name. */
export function isMcpName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name);
}
