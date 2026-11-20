export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}
export type WsFactory = (url: string) => SocketLike;
export interface ExecEvent { id?: string; type: string; [k: string]: unknown }
export interface IBridge {
  readonly connected: boolean;
  onOpen: (() => void) | null;
  onClose: (() => void) | null;
  onLegacy: ((text: string, isError: boolean) => void) | null;
  connect(url: string): void;
  close(): void;
  rpc(action: string, payload?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
  sendExec(id: string, payload: Record<string, unknown>): void;
  onExec(id: string, handler: (m: ExecEvent) => void): void;
  offExec(id: string): void;
}
interface Pending { resolve: (d: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

const defaultFactory: WsFactory = (url) => new WebSocket(url) as unknown as SocketLike;

export class BridgeClient implements IBridge {
  private ws: SocketLike | null = null;
  private open = false;
  private seq = 0;
  private pending = new Map<string, Pending>();
  private execHandlers = new Map<string, (m: ExecEvent) => void>();
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;
  onLegacy: ((text: string, isError: boolean) => void) | null = null;

  constructor(private factory: WsFactory = defaultFactory) {}

  get connected(): boolean {
    return this.open;
  }

  connect(url: string): void {
    this.close();
    const ws = this.factory(url);
    this.ws = ws;
    ws.onopen = () => {
      this.open = true;
      if (this.onOpen) this.onOpen();
    };
    ws.onmessage = (e) => this.route(e.data);
    ws.onclose = () => {
      this.open = false;
      this.ws = null;
      this.failAll(new Error('Bridge disconnected'));
      if (this.onClose) this.onClose();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    this.open = false;
    if (ws) {
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* noop */
      }
    }
    this.failAll(new Error('Bridge disconnected'));
  }

  rpc(action: string, payload: Record<string, unknown> = {}, timeoutMs = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.open || !this.ws) {
        reject(new Error('Bridge not connected'));
        return;
      }
      const id = 'q' + ++this.seq;
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(action + ' timed out'));
        }
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ ...payload, id, action }));
      } catch (e) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  sendExec(id: string, payload: Record<string, unknown>): void {
    if (!this.open || !this.ws) throw new Error('Bridge not connected');
    this.ws.send(JSON.stringify({ ...payload, id, action: 'exec' }));
  }

  onExec(id: string, handler: (m: ExecEvent) => void): void {
    this.execHandlers.set(id, handler);
  }

  offExec(id: string): void {
    this.execHandlers.delete(id);
  }

  private route(data: string): void {
    let m: ExecEvent;
    try {
      m = JSON.parse(data) as ExecEvent;
    } catch {
      if (this.onLegacy) this.onLegacy(String(data), false);
      return;
    }
    if (m.type === 'result' && typeof m.id === 'string' && this.pending.has(m.id)) {
      const p = this.pending.get(m.id)!;
      this.pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.ok) p.resolve(m.data);
      else p.reject(new Error(String(m.error || 'Request failed')));
      return;
    }

    if (m.type === 'result' && m.action === 'exec' && typeof m.id === 'string' && this.execHandlers.has(m.id)) {
      const h = this.execHandlers.get(m.id)!;
      this.execHandlers.delete(m.id);
      h(m);
      return;
    }
    if (typeof m.id === 'string' && this.execHandlers.has(m.id)) {
      const h = this.execHandlers.get(m.id)!;
      h(m);
      if (m.type === 'exec-done') this.execHandlers.delete(m.id);
      return;
    }
    if (m.type === 'output' && this.onLegacy) this.onLegacy(String(m.text ?? ''), false);
    else if (m.type === 'error' && this.onLegacy) this.onLegacy(String(m.text ?? ''), true);
  }

  private failAll(err: Error): void {
    this.pending.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(err);
    });
    this.pending.clear();
  }
}