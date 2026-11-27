// Workspace symbols for `@file#symbol` mentions: regex-based definition finder
// over one file at a time. Deliberately shallow — it finds where a name is
// defined so the composer can complete it and attach its block, not a semantic
// index. Unknown languages get nothing rather than guesses.

export interface FileSymbol {
  name: string;
  kind: "function" | "class" | "method" | "const" | "type" | "heading" | "other";
  /** 1-based definition line. */
  line: number;
}

/** Symbols per file; skipped files past this size instead of scanned half-way. */
export const SYMBOL_FILE_LIMIT = 256 * 1024;
const SYMBOL_CAP = 200;
/** Snippet bounds: definition plus body, cut with a marker past the cap. */
const SNIPPET_LINES = 100;
const SNIPPET_CHARS = 8000;

interface Pattern {
  kind: FileSymbol["kind"];
  re: RegExp;
}

const PATTERNS: Record<string, Pattern[]> = {
  ts: [
    { kind: "function", re: /^\s*(?:export\s+)?(?:async\s+)?function\s+([\w$]+)/ },
    { kind: "class", re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([\w$]+)/ },
    { kind: "type", re: /^\s*(?:export\s+)?(?:interface|type|enum)\s+([\w$]+)/ },
    { kind: "const", re: /^\s*(?:export\s+)?const\s+([\w$]+)\s*[:=]/ },
  ],
  py: [
    { kind: "function", re: /^\s*(?:async\s+)?def\s+([\w$]+)/ },
    { kind: "class", re: /^\s*class\s+([\w$]+)/ },
  ],
  rs: [
    { kind: "function", re: /^\s*(?:pub(?:\([^)]*\))?\s*)?(?:async\s+)?fn\s+([\w$]+)/ },
    { kind: "class", re: /^\s*(?:pub(?:\([^)]*\))?\s*)?(?:struct|enum|trait|union)\s+([\w$]+)/ },
  ],
  go: [
    { kind: "function", re: /^\s*func\s+(?:\([^)]*\)\s*)?([\w$]+)/ },
    { kind: "type", re: /^\s*type\s+([\w$]+)/ },
  ],
  md: [{ kind: "heading", re: /^#{1,4}\s+(.+?)\s*$/ }],
};

const EXT_FAMILY: Record<string, string> = {
  js: "ts",
  jsx: "ts",
  mjs: "ts",
  cjs: "ts",
  ts: "ts",
  tsx: "ts",
  mts: "ts",
  cts: "ts",
  vue: "ts",
  svelte: "ts",
  astro: "ts",
  py: "py",
  pyi: "py",
  rs: "rs",
  go: "go",
  java: "java",
  rb: "py",
  erb: "py",
  php: "php",
  md: "md",
  markdown: "md",
};

const EXTRA_PATTERNS: Record<string, Pattern[]> = {
  java: [
    { kind: "class", re: /^\s*(?:public|private|protected)?\s*(?:abstract\s+|final\s+)?(?:class|interface|enum|record)\s+([\w$]+)/ },
    { kind: "method", re: /^\s*(?:public|private|protected)?\s*(?:static\s+|final\s+|async\s+)*[\w$<>\[\]., ]+?\s+([\w$]+)\s*\([^;]*\)\s*(?:throws[\w\s,]+)?\{?\s*$/ },
  ],
  php: [
    { kind: "function", re: /^\s*(?:public|private|protected)?\s*(?:static\s+)?function\s+([\w$]+)/ },
    { kind: "class", re: /^\s*(?:abstract\s+|final\s+)?(?:class|interface|trait|enum)\s+([\w$]+)/ },
  ],
};

function patternsFor(rel: string): Pattern[] {
  const ext = rel.slice(rel.lastIndexOf(".") + 1).toLowerCase();
  const family = EXT_FAMILY[ext];
  if (!family) {
    return [];
  }
  return [...(PATTERNS[family] ?? []), ...(EXTRA_PATTERNS[family] ?? [])];
}

/** Definition names in a file, in order, capped. Empty for unknown languages and huge files. */
export function extractSymbols(rel: string, content: string): FileSymbol[] {
  const text = String(content ?? "");
  if (text.length > SYMBOL_FILE_LIMIT) {
    return [];
  }
  const patterns = patternsFor(rel);
  if (!patterns.length) {
    return [];
  }
  const seen = new Set<string>();
  const out: FileSymbol[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && out.length < SYMBOL_CAP; i += 1) {
    const line = lines[i] as string;
    for (const { kind, re } of patterns) {
      const match = re.exec(line);
      const name = (match?.[1] ?? "").trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push({ name, kind, line: i + 1 });
        break;
      }
    }
  }
  return out;
}

/**
 * The block under a definition line: brace depth for braced languages, indent
 * for Python and friends. Naive but bounded — strings holding braces can cut
 * a block short, never run it past the cap.
 */
export function symbolSnippet(content: string, symbol: FileSymbol): string {
  const lines = String(content ?? "").split("\n");
  const start = Math.max(0, Math.min(symbol.line - 1, lines.length - 1));
  const indentOf = (line: string): number => line.match(/^\s*/)?.[0].length ?? 0;
  const baseIndent = indentOf(lines[start] as string);
  let depth = 0;
  let opened = false;
  const taken: string[] = [];
  // Decorators above belong to the definition.
  const prefix: string[] = [];
  for (let i = start - 1; i >= 0 && prefix.length < 3; i -= 1) {
    const above = lines[i] as string;
    if (!/^\s*@/.test(above)) {
      break;
    }
    prefix.unshift(above);
  }
  for (let i = start; i < lines.length && taken.length < SNIPPET_LINES; i += 1) {
    const line = lines[i] as string;
    taken.push(line);
    for (const ch of line) {
      if (ch === "{") {
        depth += 1;
        opened = true;
      } else if (ch === "}") {
        depth -= 1;
      }
    }
    if (i > start) {
      if (opened && depth <= 0) {
        break;
      }
      if (!opened && line.trim() && indentOf(line) <= baseIndent) {
        taken.pop();
        break;
      }
    }
  }
  while (taken.length > 1 && !(taken[taken.length - 1] as string).trim()) {
    taken.pop();
  }
  let snippet = [...prefix, ...taken].join("\n");
  let truncated = taken.length >= SNIPPET_LINES;
  if (snippet.length > SNIPPET_CHARS) {
    snippet = snippet.slice(0, SNIPPET_CHARS);
    truncated = true;
  }
  return truncated ? `${snippet}\n…[truncated]` : snippet;
}
