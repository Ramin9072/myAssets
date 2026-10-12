import { useEffect, useRef, type ReactNode } from 'react';

export function ConfirmDialog(props: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="dialog" onCancel={(e) => { e.preventDefault(); props.onCancel(); }}>
      <h3>{props.title}</h3>
      <div className="dialog-body">{props.children}</div>
      <div className="dialog-actions">
        <button className={props.danger ? 'btn danger' : 'btn primary'} onClick={props.onConfirm} disabled={props.busy}>
          {props.busy ? 'در حال انجام…' : props.confirmLabel}
        </button>
        <button className="btn ghost" onClick={props.onCancel} disabled={props.busy}>
          {props.cancelLabel ?? 'انصراف'}
        </button>
      </div>
    </dialog>
  );
}

export type ToastState = { kind: 'ok' | 'error'; text: string } | null;

export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, toast.kind === 'ok' ? 4000 : 9000);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind}`} role="status" aria-live="polite">
      <span>{toast.text}</span>
      <button className="toast-x" onClick={onClose} aria-label="بستن">×</button>
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'muted'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
