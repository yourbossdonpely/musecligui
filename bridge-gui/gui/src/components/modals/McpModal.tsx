import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { Dialog } from '../ui/overlay';

interface Server { name: string; url?: string; command?: string }

export function McpModal() {
  const { client, closeModal, toast } = useApp();
  const [servers, setServers] = useState<Server[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'url' | 'command'>('url');
  const [url, setUrl] = useState('');
  const [command, setCommand] = useState('');
  const [scope, setScope] = useState('user');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});

  async function load() {
    try {
      const m = (await client.rpc('mcp-list', {}, 30000)) as { servers?: Server[] };
      setServers(m.servers ?? []);
    } catch (e) {
      toast('MCP list failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function add() {
    if (!name.trim()) {
      toast('Enter a server name.');
      return;
    }
    try {
      if (kind === 'url') {
        if (!url.trim()) {
          toast('Enter a server URL.');
          return;
        }
        await client.rpc('mcp-add', { name: name.trim(), url: url.trim(), scope }, 60000);
      } else {
        const parts = command.trim().split(/\s+/).filter(Boolean);
        if (!parts.length) {
          toast('Enter a command.');
          return;
        }
        await client.rpc('mcp-add', { name: name.trim(), command: parts, scope }, 60000);
      }
      toast('MCP server added: ' + name.trim());
      setName('');
      setUrl('');
      setCommand('');
      await load();
    } catch (e) {
      toast('MCP add failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function remove(nm: string) {
    try {
      await client.rpc('mcp-remove', { name: nm, scope }, 60000);
      toast('MCP server removed: ' + nm);
      setConfirmId(null);
      await load();
    } catch (e) {
      toast('MCP remove failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function toggleDetails(nm: string) {
    if (details[nm]) {
      setDetails((prev) => {
        const next = { ...prev };
        delete next[nm];
        return next;
      });
      return;
    }
    try {
      const d = await client.rpc('mcp-get', { name: nm }, 30000);
      setDetails((prev) => ({ ...prev, [nm]: JSON.stringify(d, null, 1) }));
    } catch (e) {
      toast('MCP details failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <Dialog title="MCP Servers" desc="Model Context Protocol servers extend the agent with tools, databases and docs. Changes apply to the real CLI config." onClose={closeModal}>
      <div className="mb-4 flex flex-col gap-2 rounded-xl border border-edge bg-base0 p-3">
        <input data-testid="mcp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Server name" aria-label="Server name" className="rounded-lg border border-edge bg-base1 px-3 py-2 text-[13px] outline-none placeholder:text-faint focus:border-flare" />
        <div className="flex gap-2">
          <select data-testid="mcp-type" value={kind} onChange={(e) => setKind(e.target.value as 'url' | 'command')} aria-label="Server type" className="rounded-lg border border-edge bg-base1 px-2 py-2 text-[12px] outline-none focus:border-flare">
            <option value="url">URL</option>
            <option value="command">Command</option>
          </select>
          <select data-testid="mcp-scope" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope" className="rounded-lg border border-edge bg-base1 px-2 py-2 text-[12px] outline-none focus:border-flare">
            <option value="user">user</option>
            <option value="project">project</option>
          </select>
        </div>
        {kind === 'url' ? (
          <input data-testid="mcp-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." aria-label="Server URL" className="rounded-lg border border-edge bg-base1 px-3 py-2 font-mono text-[12px] outline-none placeholder:text-faint focus:border-flare" />
        ) : (
          <input data-testid="mcp-command" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="node server.js --stdio" aria-label="Server command" className="rounded-lg border border-edge bg-base1 px-3 py-2 font-mono text-[12px] outline-none placeholder:text-faint focus:border-flare" />
        )}
        <button onClick={() => void add()} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-bold text-white hover:brightness-110">Add server</button>
      </div>
      <div className="flex flex-col gap-1.5">
        {servers.map((s) => (
          <div key={s.name} data-testid="mcp-row" className="rounded-lg border border-edge bg-base0 px-3 py-2">
            <div className="flex items-center gap-2">
              <span onClick={() => void toggleDetails(s.name)} className="min-w-0 flex-1 cursor-pointer truncate text-[13px] font-semibold hover:text-flare">{s.name}</span>
              {confirmId === s.name ? (
                <button onClick={() => void remove(s.name)} className="rounded-md bg-rose/15 px-2.5 py-1 text-[11px] font-bold text-rose">Confirm remove</button>
              ) : (
                <button onClick={() => setConfirmId(s.name)} className="rounded-md border border-edge px-2.5 py-1 text-[11px] font-bold text-dim hover:border-rose hover:text-rose">Remove</button>
              )}
            </div>
            {details[s.name] ? <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-dim">{details[s.name]}</pre> : null}
          </div>
        ))}
        {!servers.length ? <p className="py-2 text-center text-[12px] text-faint">No MCP servers configured.</p> : null}
      </div>
      <div className="mt-4 flex justify-end">
        <button onClick={closeModal} className="rounded-lg px-5 py-2 text-[13px] font-bold text-dim hover:bg-base2 hover:text-ink">Close</button>
      </div>
    </Dialog>
  );
}