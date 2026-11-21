import { useState } from 'react';
import { useApp } from '../../state/store';
import { Dialog } from '../ui/overlay';
import { Button } from '../ui/core';
import { PickerBody } from './picker';

export function ProjectModal() {
  const { modal, projects, addProject, updateProject, closeModal, client, toast } = useApp();
  const editIdx = modal.editProject ?? null;
  const existing = editIdx != null ? projects[editIdx] : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [path, setPath] = useState(existing?.path ?? '');
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  async function browseNative() {
    try {
      const r = (await client.rpc('pick-folder', {}, 120000)) as { path?: string; cancelled?: boolean };
      if (r && r.path) { setPath(r.path); return; }
      if (r && (r as { cancelled?: boolean }).cancelled) return;
      setPicking(true);
    } catch {
      setPicking(true);
      toast('Native picker unavailable — pick from the list instead.');
    }
  }
  async function save() {
    setSaving(true);
    try {
      const err = editIdx == null ? await addProject(name, path) : await updateProject(editIdx, name, path);
      if (!err) closeModal();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title={editIdx == null ? 'Add New Project' : 'Edit Project'} desc="The agent runs inside this folder. Use Browse to pick it visually (never your home folder)." onClose={closeModal}>
      {picking ? (
        <PickerBody onPick={(p) => { setPath(p); setPicking(false); }} />
      ) : (
        <>
          <div className="mb-4">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-dim">Project Name</label>
            <input data-testid="proj-name" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., My Laravel App" className="w-full rounded-lg border border-edge bg-base0 px-3 py-2.5 text-[13px] outline-none placeholder:text-faint focus:border-flare" />
          </div>
          <div className="mb-2">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-dim">Folder Path</label>
            <div className="flex gap-2">
              <input data-testid="proj-path" value={path} onChange={(e) => setPath(e.target.value)} placeholder="C:\\path\\to\\project" className="min-w-0 flex-1 rounded-lg border border-edge bg-base0 px-3 py-2.5 font-mono text-[12px] outline-none placeholder:text-faint focus:border-flare" />
              <Button variant="subtle" onClick={() => void browseNative()}>Browse...</Button>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={closeModal}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>Save Project</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}