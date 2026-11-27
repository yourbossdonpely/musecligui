// Browser speech v1: read Muse replies aloud with the Web Speech API.
// Text is cleaned for the ear (code collapses to a spoken placeholder),
// and voice choice prefers a female English voice out of the box.
import { stripSuggestions } from './suggestions';

export interface VoiceLike { name: string; lang: string; voiceURI: string; localService?: boolean }

export function speechText(markdown: string): string {
  let t = stripSuggestions(String(markdown || ''));
  t = t.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const n = String(code).split('\n').filter((l) => l.trim()).length;
    return `\nCode block, ${n} line${n === 1 ? '' : 's'}${lang ? ', ' + lang : ''}.\n`;
  });
  t = t.replace(/`([^`]+)`/g, '$1');
  t = t.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2');
  t = t.replace(/(^|\W)\*([^*\n]+)\*/g, '$1$2');
  t = t.replace(/^>\s?/gm, '');
  t = t.replace(/^(\s*[-*+]|\s*\d+[.)])\s+/gm, '');
  t = t.replace(/^(\s*[-*_]){3,}\s*$/gm, '');
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim().slice(0, 20000);
}

const FEMALE_HINT = /aria|jenny|zira|samantha|female|hazel|mia\b|nancy|google uk english female|allison|ava|joana|moira|tessa|zira/i;

export function pickVoice(voices: VoiceLike[], preferredURI?: string): VoiceLike | null {
  if (!voices.length) return null;
  if (preferredURI) {
    const hit = voices.find((v) => v.voiceURI === preferredURI);
    if (hit) return hit;
  }
  let best: VoiceLike | null = null;
  let bestScore = -1;
  for (const v of voices) {
    let s = 0;
    if (/^en([-_]|$)/i.test(v.lang || '')) s += 2;
    if (FEMALE_HINT.test(v.name || '')) s += 3;
    if (/online|natural|neural/i.test(v.name || '')) s += 1;
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return best ?? voices[0];
}

interface SynthLike {
  speak(u: unknown): void;
  cancel(): void;
  getVoices(): VoiceLike[];
}

function getSynth(): SynthLike | null {
  try {
    const w = window as unknown as { speechSynthesis?: SynthLike };
    return w.speechSynthesis ?? null;
  } catch {
    return null;
  }
}

let speaking = false;
let activeKey: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((cb) => {
    try { cb(); } catch { /* noop */ }
  });
}

export function subscribeSpeech(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function speechState(): { speaking: boolean; key: string | null } {
  return { speaking, key: activeKey };
}

export function stopSpeech(): void {
  try {
    getSynth()?.cancel();
  } catch {
    /* noop */
  }
  speaking = false;
  activeKey = null;
  emit();
}

export function listVoices(): VoiceLike[] {
  try {
    return getSynth()?.getVoices() ?? [];
  } catch {
    return [];
  }
}

interface UtterCtor { new (): { text: string; voice: unknown; rate: number; onend: (() => void) | null; onerror: (() => void) | null } }

export function speakText(text: string, voiceURI?: string, rate?: number, key?: string): boolean {
  const synth = getSynth();
  let Ctor: UtterCtor | null = null;
  try {
    Ctor = (window as unknown as { SpeechSynthesisUtterance?: UtterCtor }).SpeechSynthesisUtterance ?? null;
  } catch {
    Ctor = null;
  }
  const clean = speechText(text);
  if (!synth || !Ctor || !clean) return false;
  const done = () => {
    if (activeKey === (key ?? null)) {
      speaking = false;
      activeKey = null;
      emit();
    }
  };
  try {
    synth.cancel();
    const u = new Ctor();
    u.text = clean;
    const voices = synth.getVoices() ?? [];
    const v = pickVoice(voices, voiceURI);
    if (v) {
      const real = voices.find((x) => x.voiceURI === v.voiceURI);
      u.voice = (real ?? v) as unknown;
    }
    u.rate = Math.min(1.5, Math.max(0.6, rate ?? 0.95));
    u.onend = done;
    u.onerror = done;
    speaking = true;
    activeKey = key ?? null;
    emit();
    synth.speak(u);
    return true;
  } catch {
    speaking = false;
    activeKey = null;
    emit();
    return false;
  }
}
