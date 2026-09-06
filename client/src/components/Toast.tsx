import { useEffect } from 'react';

export interface ToastState {
  message: string;
  onUndo?: () => void;
  durationMs?: number;
}

export function Toast({ state, onDone }: { state: ToastState; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, state.durationMs ?? 5000);
    return () => clearTimeout(t);
  }, [state, onDone]);

  return (
    <div className="toast" role="status">
      <span>{state.message}</span>
      {state.onUndo && (
        <button
          onClick={() => {
            state.onUndo?.();
            onDone();
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
