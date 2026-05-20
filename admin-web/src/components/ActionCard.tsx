import type { ReactNode } from 'react';

type Props = {
  title: string;
  description: string;
  costHint?: string;
  afterHint?: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  pending?: boolean;
  secondary?: ReactNode;
  variant?: 'primary' | 'secondary';
};

export default function ActionCard({
  title,
  description,
  costHint,
  afterHint,
  actionLabel,
  onAction,
  disabled,
  pending,
  secondary,
  variant = 'primary',
}: Props) {
  return (
    <article className="card action-card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p className="muted" style={{ margin: '0.35rem 0' }}>
        {description}
      </p>
      {costHint && (
        <p className="muted" style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
          {costHint}
        </p>
      )}
      {afterHint && (
        <p className="muted" style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
          完成后：{afterHint}
        </p>
      )}
      <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button
          type="button"
          className={variant === 'primary' ? 'btn' : 'btn secondary'}
          disabled={disabled || pending}
          onClick={onAction}
        >
          {pending ? '处理中…' : actionLabel}
        </button>
        {secondary}
      </div>
    </article>
  );
}
