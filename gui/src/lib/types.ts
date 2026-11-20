export interface ChatMsg { type: 'user' | 'muse' | 'system' | 'thought' | 'checkpoint' | 'tool'; text: string; time?: string; data?: string[]; tool?: { name: string; event: string; t0: number; durMs: number; raw: unknown } }
export interface Session { id: number; sid: string; name: string; time: string; messages: ChatMsg[] }
export interface Project { id: number; name: string; path: string; expanded?: boolean; sessions: Session[] }
export interface Flags { yolo: boolean; approvalMode: string; trustWorkspace: boolean; sandbox: boolean; sandboxNetwork: string; write: boolean; shell: boolean; webTools: boolean }
export interface Settings { mode: string; model: string; effort: string; contributor: string; flags: Flags }
export interface AttachedFile { rel: string; content: string }
export interface Skill { id: string; name: string; scope: string; activation: string; desc: string; warnings: number }
export interface FsEntry { name: string; type: 'dir' | 'file' | 'other'; size: number | null }
export interface Drive { path: string; label: string }