import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

type AuditRow = {
  id: string;
  action: string;
  operatorName: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
};

export default function AuditLogsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => api<AuditRow[]>('/admin/api/audit-logs?take=100'),
  });

  return (
    <>
      <h2 style={{ marginTop: 0 }}>操作日志</h2>
      <p className="muted">记录发布 AI、运行任务、重试失败场等关键操作。</p>
      <button type="button" className="btn secondary" onClick={() => refetch()}>
        刷新
      </button>
      {isLoading && <p>加载中…</p>}
      <table className="card" style={{ marginTop: '1rem' }}>
        <thead>
          <tr>
            <th>时间</th>
            <th>操作</th>
            <th>操作人</th>
            <th>目标</th>
          </tr>
        </thead>
        <tbody>
          {(data || []).map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.createdAt).toLocaleString()}</td>
              <td>{r.action}</td>
              <td>{r.operatorName || '—'}</td>
              <td>
                {r.targetType} {r.targetId?.slice(0, 12) ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data?.length === 0 && (
        <p className="muted">暂无审计记录。发布 AI 或重试任务后会出现。</p>
      )}
    </>
  );
}
