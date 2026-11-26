import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/** One skill found by scanning a folder: every subfolder holding a SKILL.md. */
export interface FolderSkill {
  /** `folder:<directory name>`, so folder skills never collide with Muse's own ids. */
  id: string;
  name: string;
  displayName: string;
  description: string;
  shortDescription: string | null;
  /** Absolute path of the SKILL.md; stays on the server, used to load the body. */
  path: string;
}

/** A SKILL.md's YAML frontmatter, one `key: value` per line; quotes stripped, nothing else parsed. */
export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) {
    return { data: {}, body: text };
  }
  const data: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const cut = line.indexOf(":");
    if (cut <= 0) {
      continue;
    }
    const key = line.slice(0, cut).trim();
    let value = line.slice(cut + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    if (key && !(key in data)) {
      data[key] = value;
    }
  }
  return { data, body: text.slice(match[0].length) };
}

/** The body without frontmatter, for what the model reads when the skill is applied. */
export function skillFileBody(text: string): string {
  return parseFrontmatter(text).body.trim();
}

function firstSentence(text: string): string | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) {
    return null;
  }
  const cut = clean.search(/[.!?](\s|$)/);
  const sentence = (cut >= 0 ? clean.slice(0, cut + 1) : clean).trim();
  return sentence.length > 0 ? sentence : null;
}

/** Most skills any one folder contributes; keeps listings, menus and routing bounded. */
export const MAX_FOLDER_SKILLS = 1000;

/**
 * Reads one skill folder: every direct subfolder with a SKILL.md becomes a skill, named by its
 * frontmatter (`name`, else the folder name) and described by it (`description`, else the body's
 * first line). Unreadable folders and skill files are skipped, never fatal.
 */
export async function scanSkillFolder(dir: string): Promise<FolderSkill[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const found: FolderSkill[] = [];
  for (const entry of entries.sort()) {
    if (found.length >= MAX_FOLDER_SKILLS) {
      break;
    }
    if (entry.startsWith(".")) {
      continue;
    }
    const file = join(dir, entry, "SKILL.md");
    let info = null;
    try {
      info = await stat(file);
    } catch {
      continue;
    }
    if (!info.isFile() || info.size > 1024 * 1024) {
      continue;
    }
    let text = "";
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const { data, body } = parseFrontmatter(text);
    const name = data["name"]?.trim() || entry;
    const description = data["description"]?.trim() || body.split("\n").map((line) => line.trim()).find((line) => line.length > 0) || "";
    found.push({
      id: `folder:${entry}`,
      name,
      displayName: name,
      description,
      shortDescription: firstSentence(description),
      path: file,
    });
  }
  return found;
}
