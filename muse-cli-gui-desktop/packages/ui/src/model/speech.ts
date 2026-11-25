import { stripSuggestions } from "./suggestions.js";

export interface VoiceLike {
  name: string;
  lang: string;
  voiceURI: string;
  localService?: boolean;
}

/**
 * A reply rewritten for the ear: suggestion blocks gone, code collapsed to a spoken placeholder,
 * markdown ornaments stripped. Capped so a long reply cannot queue minutes of speech.
 */
export function speechText(markdown: string): string {
  let t = stripSuggestions(String(markdown || ""));
  t = t.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const n = String(code).split("\n").filter((l) => l.trim()).length;
    return `\nCode block, ${n} line${n === 1 ? "" : "s"}${lang ? ", " + lang : ""}.\n`;
  });
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/(\*\*|__)(.*?)\1/g, "$2");
  t = t.replace(/(^|\W)\*([^\n*]+)\*/g, "$1$2");
  t = t.replace(/^>\s?/gm, "");
  t = t.replace(/^(\s*[-*+]|\s*\d+[.)])\s+/gm, "");
  t = t.replace(/^(\s*[-*_]){3,}\s*$/gm, "");
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim().slice(0, 20000);
}

const FEMALE_HINT = /aria|jenny|zira|samantha|female|hazel|mia\b|nancy|google uk english female|allison|ava|joana|moira|tessa/i;

/** The saved voice when it is still around, else a female English voice, else the first one. */
export function pickVoice(voices: VoiceLike[], preferredURI?: string): VoiceLike | null {
  if (!voices.length) {
    return null;
  }
  if (preferredURI) {
    const hit = voices.find((v) => v.voiceURI === preferredURI);
    if (hit) {
      return hit;
    }
  }
  let best: VoiceLike | null = null;
  let bestScore = -1;
  for (const v of voices) {
    let s = 0;
    if (/^en([-_]|$)/i.test(v.lang || "")) {
      s += 2;
    }
    if (FEMALE_HINT.test(v.name || "")) {
      s += 3;
    }
    if (/online|natural|neural/i.test(v.name || "")) {
      s += 1;
    }
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return best ?? voices[0];
}
