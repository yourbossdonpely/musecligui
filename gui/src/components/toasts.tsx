import { useApp } from '../state/store';

export function ToastStack() {
  const { toasts } = useApp();
  return (
    <div data-testid="toast-stack" className="pointer-events-none fixed bottom-14 right-5 z-[60] flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role="status" className="rounded-xl border border-edge bg-base1 px-4 py-2.5 text-[12px] text-ink shadow-xl">
          {t.text}
        </div>
      ))}
    </div>
  );
}