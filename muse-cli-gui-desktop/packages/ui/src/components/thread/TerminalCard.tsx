import { useEffect, useRef, useState } from "react";
import { useApp, useController } from "../../app/context.js";
import { useImeGuard } from "../../app/ime.js";
import { CaretRightIcon, TerminalWindowIcon } from "../ui/icons.js";
import { cn } from "../ui/primitives.js";

/** A thread's terminal: run workspace commands without leaving the app. Runs also appear in the transcript. */
export function TerminalCard(props: { sessionId: string; readOnly: boolean }) {
  const controller = useController();
  const ime = useImeGuard();
  const runs = useApp((s) => s.threads[props.sessionId]?.shellRuns ?? []);
  const busy = useApp((s) => Boolean(s.busy[`shell:${props.sessionId}`]));
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(runs.length);
  useEffect(() => {
    // A fresh run opens the card and follows it, so output never lands out of sight.
    if (runs.length > countRef.current) {
      setOpen(true);
      endRef.current?.scrollIntoView({ block: "end" });
    }
    countRef.current = runs.length;
  }, [runs.length]);
  const run = () => {
    const clean = command.trim();
    if (!clean || busy || props.readOnly) {
      return;
    }
    setCommand("");
    void controller.runCommand(props.sessionId, clean);
  };
  return (
    <section aria-label="Terminal" className="rounded-xl bg-sunken">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-8 w-full items-center gap-2 rounded-xl px-2 text-left transition-colors hover:bg-hover"
      >
        <TerminalWindowIcon size={14} className="shrink-0 text-subtle" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted">Terminal</span>
        {runs.length > 0 ? <span className="shrink-0 text-xs text-subtle tabular-nums">{runs.length}</span> : null}
        <CaretRightIcon size={12} className={cn("shrink-0 text-subtle transition-transform duration-150", open && "rotate-90")} />
      </button>
      {open ? (
        <div className="flex flex-col gap-1 px-2 pb-2">
          {runs.length > 0 ? (
            <ol className="flex max-h-56 flex-col gap-2 overflow-y-auto py-1" aria-label="Command history">
              {runs.slice(-50).map((run) => (
                <li key={run.id} className="min-w-0">
                  <p className="truncate font-mono text-[11.5px] text-fg">
                    <span aria-hidden="true" className="text-accent-text">$ </span>
                    {run.command}
                  </p>
                  <pre className="mt-0.5 overflow-x-auto font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">
                    {run.output || (run.exitCode === 0 || run.exitCode === null ? "(no output)" : `(exit ${run.exitCode})`)}
                  </pre>
                </li>
              ))}
              <div ref={endRef} />
            </ol>
          ) : (
            <p className="py-1 text-xs text-subtle">Run workspace commands here. Prefix with ! anywhere to do the same from the composer.</p>
          )}
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true" className="shrink-0 font-mono text-xs text-accent-text">$</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onCompositionStart={ime.onCompositionStart}
              onCompositionEnd={ime.onCompositionEnd}
              onKeyUp={ime.onKeyUp}
              onKeyDown={(e) => {
                if (ime.isImeKey(e)) {
                  return;
                }
                if (e.key === "Enter" && !e.repeat) {
                  run();
                }
              }}
              placeholder={props.readOnly ? "Read-only" : "ls -la"}
              aria-label="Terminal command"
              spellCheck={false}
              disabled={props.readOnly || busy}
              className="h-7 min-w-0 flex-1 rounded-md bg-raised px-2 font-mono text-xs text-fg outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
