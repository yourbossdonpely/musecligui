import type { IBridge, ExecEvent } from '../lib/bridge';

export class MockBridge implements IBridge {
  opened = false;
  sent: Array<Record<string, unknown>> = [];
  rpcImpl: Record<string, (payload: Record<string, unknown>) => unknown> = {};
  execImpl: ((id: string, payload: Record<string, unknown>) => void) | null = null;
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;
  onLegacy: ((text: string, isError: boolean) => void) | null = null;
  private execHandlers = new Map<string, (m: ExecEvent) => void>();

  get connected(): boolean {
    return this.opened;
  }
  connect(_url: string): void {
    /* manual open() in tests */
  }
  open(): void {
    this.opened = true;
    if (this.onOpen) this.onOpen();
  }
  close(): void {
    this.opened = false;
    if (this.onClose) this.onClose();
  }
  async rpc(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.opened) throw new Error('Bridge not connected');
    const fn = this.rpcImpl[action];
    if (!fn) throw new Error('No mock for ' + action);
    return fn(payload);
  }
  sendExec(id: string, payload: Record<string, unknown>): void {
    if (!this.opened) throw new Error('Bridge not connected');
    this.sent.push({ id, ...payload });
    if (this.execImpl) this.execImpl(id, payload);
  }
  onExec(id: string, handler: (m: ExecEvent) => void): void {
    this.execHandlers.set(id, handler);
  }
  offExec(id: string): void {
    this.execHandlers.delete(id);
  }
  emitExec(id: string, m: Record<string, unknown>): void {
    const h = this.execHandlers.get(id);
    if (h) h({ id, ...m } as ExecEvent);
    if (m['type'] === 'exec-done') this.execHandlers.delete(id);
  }
}

export function stdFs(rpcImpl: Record<string, (p: Record<string, unknown>) => unknown>, badRoot?: string): void {
  rpcImpl['fs-drives'] = () => ({ drives: [{ path: 'C:\\', label: 'Drive C' }] });
  rpcImpl['fs-list'] = (p) => {
    const root = String(p['root'] ?? '');
    if (badRoot && root === badRoot) throw new Error('not readable');
    if (root === 'C:\\') return { path: root, entries: [{ name: 'sub', type: 'dir', size: null }] };
    if (root === 'C:\\sub') return { path: root, entries: [] };
    return { path: root, entries: [] };
  };
}