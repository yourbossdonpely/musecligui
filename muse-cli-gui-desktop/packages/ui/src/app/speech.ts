import { pickVoice, speechText, type VoiceLike } from "../model/speech.js";

interface SynthLike {
  speak(u: unknown): void;
  cancel(): void;
  getVoices(): VoiceLike[];
  addEventListener?(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
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
    try {
      cb();
    } catch {
      /* a dead listener never stops speech */
    }
  });
}

export function subscribeSpeech(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
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

/** Voices arrive late in some browsers; the settings page re-reads them when this fires. */
export function onVoicesChanged(cb: () => void): () => void {
  const synth = getSynth();
  if (!synth?.addEventListener) {
    return () => {};
  }
  synth.addEventListener("voiceschanged", cb);
  return () => {
    try {
      synth.removeEventListener?.("voiceschanged", cb);
    } catch {
      /* noop */
    }
  };
}

interface UtterCtor {
  new (): { text: string; voice: unknown; rate: number; onend: (() => void) | null; onerror: (() => void) | null };
}

/** Reads one reply aloud; false when this browser cannot speak or the reply has nothing to say. */
export function speakText(text: string, voiceURI?: string, rate?: number, key?: string): boolean {
  const synth = getSynth();
  let Ctor: UtterCtor | null = null;
  try {
    Ctor = (window as unknown as { SpeechSynthesisUtterance?: UtterCtor }).SpeechSynthesisUtterance ?? null;
  } catch {
    Ctor = null;
  }
  const clean = speechText(text);
  if (!synth || !Ctor || !clean) {
    return false;
  }
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
