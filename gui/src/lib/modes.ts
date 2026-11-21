import type { Flags, Settings } from './types';

export interface ModeDef { label: string; desc: string; flags: Flags }
export const MODES: Record<string, ModeDef> = {
  build: { label: 'Build', desc: 'Full speed: no approvals, no sandbox. Trusts the workspace.', flags: { yolo: true, approvalMode: 'never', trustWorkspace: true, sandbox: false, sandboxNetwork: 'proxy-only', write: true, shell: true, webTools: true } },
  supervised: { label: 'Supervised', desc: 'Agent acts freely but the OS sandbox stays on (network via proxy).', flags: { yolo: false, approvalMode: 'never', trustWorkspace: true, sandbox: true, sandboxNetwork: 'proxy-only', write: true, shell: true, webTools: true } },
  plan: { label: 'Plan', desc: 'Read-only exploration. The agent plans but cannot write files or run shell commands.', flags: { yolo: false, approvalMode: 'never', trustWorkspace: true, sandbox: true, sandboxNetwork: 'proxy-only', write: false, shell: false, webTools: true } },
  research: { label: 'Research', desc: 'Deep research with web tools. Answers come back with cited sources.', flags: { yolo: false, approvalMode: 'never', trustWorkspace: true, sandbox: true, sandboxNetwork: 'proxy-only', write: true, shell: true, webTools: true } },
  debug: { label: 'Debug', desc: 'Fix mode: runs code and tests to reproduce, diagnose, fix and verify.', flags: { yolo: false, approvalMode: 'never', trustWorkspace: true, sandbox: true, sandboxNetwork: 'proxy-only', write: true, shell: true, webTools: true } },
};
export interface FlagDef { key: keyof Flags; label: string; desc: string; code: string; type: 'bool' | 'select'; options?: string[] }
export const FLAG_DEFS: FlagDef[] = [
  { key: 'yolo', label: 'YOLO mode', desc: 'Disables approval AND sandbox, trusts workspace. Overrides all other flags.', code: '--yolo', type: 'bool' },
  { key: 'approvalMode', label: 'Approval mode', desc: 'Headless runs cannot answer prompts, so never is the practical default.', code: '--approval-mode', type: 'select', options: ['never', 'on-request', 'untrusted'] },
  { key: 'trustWorkspace', label: 'Trust workspace', desc: 'Loads the project skills and rules for this run.', code: '--trust-workspace', type: 'bool' },
  { key: 'sandbox', label: 'OS sandbox', desc: 'Sandboxed filesystem/network access for shell tools.', code: '--disable-sandbox (when off)', type: 'bool' },
  { key: 'sandboxNetwork', label: 'Sandbox network', desc: 'Only applies when the sandbox is on.', code: '--sandbox-network', type: 'select', options: ['proxy-only', 'restricted', 'enabled'] },
  { key: 'write', label: 'File writes', desc: 'Allow the agent to write and edit files. Off = read-only plan mode.', code: '--disable-write (when off)', type: 'bool' },
  { key: 'shell', label: 'Shell execution', desc: 'Allow the agent to run shell commands.', code: '--disable-shell (when off)', type: 'bool' },
  { key: 'webTools', label: 'Web tools', desc: 'Allow the agent to browse/search the web. Off adds --disable-web-tools.', code: '--disable-web-tools (when off)', type: 'bool' },
];
export function defaultSettings(): Settings {
  return { mode: 'build', model: '', effort: '', contributor: 'off', flags: { ...MODES.build.flags }, contextWindows: {} };
}
export function permsPreview(s: Settings): string {
  const f = s.flags;
  const a = ['muse', 'exec', '--json'];
  if (s.model) a.push('--model', s.model);
  if (s.effort) a.push('--reasoning-effort', s.effort);
  if (f.yolo) {
    a.push('--yolo');
  } else {
    a.push('--approval-mode', f.approvalMode || 'never');
    if (f.trustWorkspace) a.push('--trust-workspace');
    if (f.sandbox === false) a.push('--disable-sandbox');
    else if (f.sandboxNetwork) a.push('--sandbox-network', f.sandboxNetwork);
    if (f.write === false) a.push('--disable-write');
    if (f.shell === false) a.push('--disable-shell');
  }
  if (f.webTools === false) a.push('--disable-web-tools');
  return a.join(' ');
}
export function permsSummary(mode: string, f: Flags): string {
  if (mode !== 'custom' && MODES[mode]) return MODES[mode].label;
  if (f.yolo) return 'Custom (yolo)';
  const bits: string[] = [];
  if (f.write === false) bits.push('read-only');
  if (f.shell === false) bits.push('no-shell');
  if (f.sandbox === false) bits.push('no-sandbox');
  return 'Custom' + (bits.length ? ' (' + bits.join(', ') + ')' : '');
}