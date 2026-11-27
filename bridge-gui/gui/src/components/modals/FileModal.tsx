import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { Dialog } from '../ui/overlay';
import { Button } from '../ui/core';
import { fmtSize } from '../../lib/protocol';

export function FileModal() {
  const { modal, project, client, attachFile, closeModal, toast } = useApp();
  const rel = modal.previewRel ?? '';
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [size, setSize] = useState(0);
  useEffect(() => {
    let alive = true;
    setContent(null);
    setError('');
    if (!project) {
      setError('No project selected.');
      return;
    }
    client.rpc('fs-read', { root: project.path, rel }, 30000).then(
      (d) => {
        if (!alive) return;
        const r = d as { content: string; size: number };
        setContent(r.content);
        setSize(r.size);
      },
      (e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      alive = false;
    };
  }, [client, project, rel]);
  const name = rel.split('\\').pop() ?? rel;
  return (
    <Dialog title={name} desc={error || rel + (content != null ? ' · ' + fmtSize(size) : '')} wide onClose={closeModal}>
      <pre className="max-h-[50vh] overflow-auto whitespace-pre rounded-xl border border-edge bg-black/40 p-3.5 font-mono text-[12px] leading-relaxed">{content ?? (error ? 'Error: ' + error : 'Loading...')}</pre>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={closeModal}>Close</Button>
        <Button
          variant="subtle"
          onClick={() => {
            const full = project ? project.path + '\\' + rel : rel;
            try {
              if (navigator.clipboard?.writeText) navigator.clipboard.writeText(full).then(() => toast('Path copied.'), () => toast('Copy failed.'));
              else toast('Clipboard unavailable: ' + full);
            } catch {
              toast('Copy unavailable: ' + full);
            }
          }}
        >
          Copy path
        </Button>
        <Button
          onClick={() => {
            if (content == null) {
              toast('Nothing to attach.');
              return;
            }
            if (attachFile(rel, content)) {
              closeModal();
              toast('Attached: ' + rel);
            }
          }}
        >
          Attach to prompt
        </Button>
      </div>
    </Dialog>
  );
}