import { useState } from "react";
import { useApp, useController } from "../../app/context.js";
import type { SkillEntry } from "../../types.js";
import { PuzzlePieceIcon, TrashIcon } from "../ui/icons.js";
import { Button, cn } from "../ui/primitives.js";

/** One more folder of skills to keep, by typed path. The server refuses what is not a folder. */
export function SkillFolderForm() {
  const controller = useController();
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const clean = path.trim();
    if (!clean || busy) {
      return;
    }
    setBusy(true);
    try {
      await controller.addSkillFolder(clean);
      setPath("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <input
        type="text"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            void add();
          }
        }}
        placeholder="D:\skills  or  ~/skills"
        aria-label="Skill folder path"
        spellCheck={false}
        className="h-7 min-w-0 flex-1 rounded-md bg-sunken px-2 font-mono text-xs text-fg outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-accent"
      />
      <Button size="sm" variant="secondary" disabled={!path.trim() || busy} onClick={() => void add()}>
        Add
      </Button>
    </div>
  );
}

/** Kept folders with remove buttons, plus what the shared agents folder contributes. */
export function SkillFolderRows() {
  const controller = useController();
  const folders = useApp((s) => s.skillFolders);
  if (!folders) {
    return <p className="text-xs text-subtle">Loading…</p>;
  }
  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex items-center gap-2 text-xs">
        <PuzzlePieceIcon size={13} className="shrink-0 text-subtle" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted" title={folders.agentsDir}>
          {folders.agentsDir}
        </span>
        <span className="shrink-0 text-2xs text-subtle">
          {folders.agentsFound ? `${folders.agentsCount} skill${folders.agentsCount === 1 ? "" : "s"}` : "not found"}
        </span>
      </div>
      {folders.folders.map((folder) => (
        <div key={folder} className="group flex items-center gap-2 text-xs">
          <PuzzlePieceIcon size={13} className="shrink-0 text-subtle" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg" title={folder}>
            {folder}
          </span>
          <button
            type="button"
            aria-label={`Remove ${folder}`}
            title="Stop scanning this folder"
            onClick={() => void controller.removeSkillFolder(folder)}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-subtle transition-colors hover:bg-hover hover:text-fg"
          >
            <TrashIcon size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** A workspace's skills for picking: click one to start typing its /command in the composer. */
export function WorkspaceSkills(props: { sessionId: string; cwd: string; onPick: () => void }) {
  const controller = useController();
  const catalog = useApp((s) => s.skills[props.cwd] ?? null);
  if (!catalog || catalog.status === "loading") {
    return <p className="px-2 py-1 text-xs text-subtle">Loading skills…</p>;
  }
  if (catalog.status === "error") {
    return <p className="px-2 py-1 text-xs text-subtle">{catalog.error ?? "Could not load skills."}</p>;
  }
  if (catalog.skills.length === 0) {
    return <p className="px-2 py-1 text-xs text-subtle">No skills here. Add a folder below.</p>;
  }
  const pick = (skill: SkillEntry) => {
    controller.prefillComposer(props.sessionId, `/${skill.name} `);
    props.onPick();
  };
  return (
    <ul className="max-h-64 overflow-y-auto">
      {catalog.skills.map((skill) => (
        <li key={skill.id}>
          <button
            type="button"
            onClick={() => pick(skill)}
            title={skill.description || skill.name}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover"
          >
            <PuzzlePieceIcon size={13} className="shrink-0 text-subtle" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[11.5px] text-fg">/{skill.name}</span>
              {skill.shortDescription || skill.description ? (
                <span className={cn("block truncate text-2xs text-subtle")}>{skill.shortDescription || skill.description}</span>
              ) : null}
            </span>
            {skill.scope === "folder" ? (
              <span className="shrink-0 rounded bg-active px-1 py-px text-2xs text-muted">folder</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
