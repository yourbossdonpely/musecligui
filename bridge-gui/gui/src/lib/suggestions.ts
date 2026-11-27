// Follow-up suggestion chips (FreeBuff-style). The engine asks the model to end
// every reply with a [SUGGEST] block; we parse it into clickable chips and
// strip it from the displayed text. Zero extra model calls. When the model
// omits the block (or in Demo Mode), mode-aware heuristic chips fill in.
export const SUGGEST_SUFFIX =
  '\n\n[After your reply, end with exactly 3 short follow-up suggestions, one per line, ' +
  'inside a [SUGGEST]...[/SUGGEST] block. Each suggestion must read as a concrete next ' +
  'message the user could send (under 100 characters). Do not explain the block.]';

const BLOCK_RE = /\[SUGGEST\]([\s\S]*?)\[\/SUGGEST\]/;

export function parseSuggestions(text: string): string[] {
  const m = String(text || '').match(BLOCK_RE);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^[\s>*-]+/, '').replace(/^\d+[.)]\s*/, '').trim())
    .filter((l) => l.length > 1)
    .slice(0, 3)
    .map((l) => (l.length > 120 ? l.slice(0, 117) + '...' : l));
}

export function stripSuggestions(text: string): string {
  return String(text || '').replace(BLOCK_RE, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const FALLBACKS: Record<string, string[]> = {
  build: ['Review the diff of these changes', 'Run the tests to verify this', 'Explain what changed and why'],
  supervised: ['Review the diff of these changes', 'Run the tests to verify this', 'Explain what changed and why'],
  plan: ['Turn this plan into numbered build steps', 'What are the risks in this plan?', 'Estimate the size of each step'],
  research: ['Go deeper on the first finding', 'Compare the top two options', 'Find counter-arguments to this'],
  debug: ['Run the reproduction again to confirm', 'Add a regression test for this', 'Explain the root cause simply'],
};

export function fallbackSuggestions(mode: string): string[] {
  return [...(FALLBACKS[mode] ?? FALLBACKS.build)];
}
