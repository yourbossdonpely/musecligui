import { ArrowUUpLeftIcon, CaretRightIcon, CheckIcon, ChecksIcon, EyeIcon, MagnifyingGlassIcon, PencilSimpleLineIcon, WarningCircleIcon } from "../ui/icons.js";
import { useEffect, useMemo, useState } from "react";
import { useApp, useController } from "../../app/context.js";
import { basename } from "../../model/format.js";
import type { DiagnosticReport } from "../../types.js";
import { fileTarget } from "../../model/files.js";
import { settledCount } from "../../model/changes.js";
import { inheritedTurns, sideStart } from "../../model/fold.js";
import { isSshPath } from "../../model/paths.js";
import { cn, Spinner } from "../ui/primitives.js";
import { collectFileChanges, DiffBlock, DiffCount, type FileChanges } from "./items.js";

/** The folder part of a path, without the file name; "" at the top level. */
function dirname(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut > 0 ? path.slice(0, cut) : "";
}

/**
 * Every file the thread has edited, above the composer: how many, with line counts per file, and
 * a click opens the file (in the editor when MuseCodeIcon runs inside one, else in the file viewer).
 */
export function ChangedFiles(props: { sessionId: string }) {
  const controller = useController();
  const cwd = useApp((s) => s.sessions[props.sessionId]?.cwd ?? null);
  const fold = useApp((s) => s.threads[props.sessionId]?.fold ?? null);
  const key = `files:${props.sessionId}`;
  const open = useApp((s) => !s.prefs.collapsedCards.includes(key));
  const sideSince = useApp((s) => sideStart(s.sessions[props.sessionId]));
  const settled = useApp((s) => s.prefs.settledChanges);
  const [review, setReview] = useState(false);
  // SSH projects cannot be undone from here, so nothing is ever settled there.
  const canAct = cwd !== null && !isSshPath(cwd);
  // A side chat lists only its own edits, not the ones its thread made before it was opened. Kept and undone changes
  // are skipped, so a file the thread edits again lists only its new changes.
  const files = useMemo(() => {
    if (!fold) {
      return [];
    }
    const inherited = inheritedTurns(fold, sideSince);
    const items = fold.order.map((id) => fold.items.get(id)).filter((item) => item !== undefined);
    return collectFileChanges(
      items.filter((item) => !item.turnId || !inherited.has(item.turnId)),
      canAct ? (path) => settledCount(settled, props.sessionId, path) : undefined,
    );
  }, [fold, sideSince, settled, canAct, props.sessionId]);
  const pending = files;
  const [diag, setDiag] = useState<{ running: boolean; report: DiagnosticReport | null }>({ running: false, report: null });
  // A check covers exactly the files listed when it ran; new edits retire it.
  const signature = pending.map((f) => `${f.path}:${f.total}`).join("\n");
  useEffect(() => {
    setDiag({ running: false, report: null });
  }, [signature]);
  const runDiag = async () => {
    if (diag.running) {
      return;
    }
    if (!open) {
      controller.setCardOpen(key, true);
    }
    setDiag({ running: true, report: null });
    const report = await controller.diagnoseFiles(props.sessionId, pending.map((f) => f.path));
    setDiag({ running: false, report });
  };
  if (pending.length === 0) {
    return null;
  }
  const counted = (list: FileChanges[]) => list.map((f) => ({ path: f.path, count: f.total }));
  const undoAll = () => {
    const noun = pending.length === 1 ? "this file" : `these ${pending.length} files`;
    if (window.confirm(`Undo this thread's edits to ${noun}? Each file goes back to how it was before Muse changed it.`)) {
      void controller.undoChanges(
        props.sessionId,
        pending.map((f) => ({ ...counted([f])[0]!, steps: f.steps })),
      );
    }
  };
  const undoOne = (f: FileChanges) => {
    if (window.confirm(`Undo this thread's edits to ${basename(f.path)}?`)) {
      void controller.undoChanges(props.sessionId, [{ ...counted([f])[0]!, steps: f.steps }]);
    }
  };
  const added = pending.reduce((sum, f) => sum + f.added, 0);
  const removed = pending.reduce((sum, f) => sum + f.removed, 0);
  const listId = `changed-files-${props.sessionId}`;
  return (
    <section aria-label="Files changed in this thread" className="rounded-xl bg-raised shadow-card">
      <div className="flex items-center pr-1.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => controller.setCardOpen(key, !open)}
          className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2.5 text-left text-xs text-muted transition-colors duration-100 hover:text-fg"
        >
          <CaretRightIcon
            size={11}
            className={cn("shrink-0 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")}
          />
          <span className="font-medium text-fg">{pending.length === 1 ? "1 file changed" : `${pending.length} files changed`}</span>
          <DiffCount added={added} removed={removed} />
        </button>
        {canAct ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <ActionButton label={diag.running ? "Checking…" : "Check syntax"} onClick={() => void runDiag()}>
              {diag.running ? <Spinner size={12} /> : <ChecksIcon size={12} />}
            </ActionButton>
            <ActionButton label="Ask Muse to review these changes" onClick={() => void controller.reviewChanges(props.sessionId, pending.map((f) => f.path))}>
              <MagnifyingGlassIcon size={12} />
            </ActionButton>
            <ActionButton
              label={review ? "Hide review" : "Review"}
              onClick={() => {
                setReview(!review);
                if (!open) controller.setCardOpen(key, true);
              }}
            >
              <EyeIcon size={12} />
            </ActionButton>
            <ActionButton label="Keep all" onClick={() => controller.keepChanges(props.sessionId, counted(pending))}>
              <CheckIcon size={12} />
            </ActionButton>
            <ActionButton label="Undo all" onClick={undoAll}>
              <ArrowUUpLeftIcon size={12} />
            </ActionButton>
          </div>
        ) : null}
      </div>
      {open && (diag.running || diag.report) ? <DiagResults diag={diag} /> : null}
      {open ? (
        <ul id={listId} className={cn("overflow-y-auto px-1 pb-1", review ? "max-h-96" : "max-h-40")}>
          {pending.map((file) => {
            const target = cwd ? fileTarget(file.path, cwd) : null;
            const path = target?.path ?? file.path;
            const dir = dirname(path);
            return (
              <li key={file.path}>
                <div className="group flex items-center rounded-lg transition-colors duration-100 hover:bg-hover">
                  <button
                    type="button"
                    title={`Open ${path}`}
                    onClick={() => controller.openFile(props.sessionId, path)}
                    className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 text-left"
                  >
                    <PencilSimpleLineIcon size={12} className="shrink-0 text-subtle" />
                    <span className="shrink-0 font-mono text-[11.5px] text-fg">{basename(path)}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-2xs text-subtle">{dir}</span>
                    <DiffCount added={file.added} removed={file.removed} />
                  </button>
                  {canAct ? (
                    <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100">
                      <ActionButton
                        label={`Keep ${basename(path)}`}
                        onClick={() => controller.keepChanges(props.sessionId, counted([file]))}
                      >
                        <CheckIcon size={12} />
                      </ActionButton>
                      <ActionButton label={`Undo ${basename(path)}`} onClick={() => undoOne(file)}>
                        <ArrowUUpLeftIcon size={12} />
                      </ActionButton>
                    </div>
                  ) : null}
                </div>
                {review ? (
                  <div className="space-y-2 px-1.5 pb-2">
                    {file.diffs.map((diff, index) => (
                      <DiffBlock key={index} diff={diff} />
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/** What the syntax check found: issues per file, or a clean bill for the files checked. */
function DiagResults(props: { diag: { running: boolean; report: DiagnosticReport | null } }) {
  const { diag } = props;
  if (diag.running || !diag.report) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-subtle">
        <Spinner size={12} />
        Checking…
      </div>
    );
  }
  const { report } = diag;
  if (report.issues.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-subtle">
        <CheckIcon size={12} className="shrink-0 text-ok" />
        Clean — {report.checked} file{report.checked === 1 ? "" : "s"} checked
        {report.skipped.length > 0 ? `, ${report.skipped.length} skipped` : ""}
      </div>
    );
  }
  return (
    <ul className="max-h-40 space-y-0.5 overflow-y-auto px-1 pb-1">
      {report.issues.map((issue, index) => (
        <li
          key={index}
          className="flex items-start gap-1.5 rounded-lg px-1.5 py-1 text-xs"
          title={`${issue.file}${issue.line ? `:${issue.line}` : ""} — ${issue.message} [${issue.tool}]`}
        >
          <WarningCircleIcon size={12} className="mt-0.5 shrink-0 text-warn-text" />
          <span className="min-w-0">
            <span className="font-mono text-[11.5px] text-fg">
              {basename(issue.file)}
              {issue.line ? `:${issue.line}` : ""}
            </span>{" "}
            <span className="text-muted">{issue.message}</span>{" "}
            <span className="text-subtle">[{issue.tool}]</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ActionButton(props: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      className="flex h-6 w-6 items-center justify-center rounded-md text-subtle transition-colors duration-100 hover:bg-hover hover:text-fg"
    >
      {props.children}
    </button>
  );
}
