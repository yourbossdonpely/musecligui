export function RunLog({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <details data-testid="run-log" className="rounded-xl border border-edge bg-base1 text-[11px] text-faint">
      <summary className="cursor-pointer px-3.5 py-2 font-semibold">Run log</summary>
      <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap px-3.5 pb-2.5 font-mono text-dim">{lines.join('\n')}</pre>
    </details>
  );
}