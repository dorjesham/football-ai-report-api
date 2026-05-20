import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export default function JsonPreviewModal({
  title,
  url,
  onClose,
}: {
  title: string;
  url: string;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['json-preview', url],
    queryFn: () => api<unknown>(url),
  });

  return (
    <div className="modal-backdrop" role="dialog">
      <div className="modal card" style={{ maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {isLoading && <p className="muted">加载中…</p>}
        {error && <p className="status-err">加载失败</p>}
        {data != null && (
          <pre style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
        <button type="button" className="btn secondary" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
}
