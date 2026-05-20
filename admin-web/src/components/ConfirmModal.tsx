import type { ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  danger?: boolean;
};

export default function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
  pending,
  danger,
}: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel card">
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <div className="modal-body">{children}</div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            type="button"
            className={danger ? 'btn danger' : 'btn'}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? '处理中…' : confirmLabel}
          </button>
          <button type="button" className="btn secondary" disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
