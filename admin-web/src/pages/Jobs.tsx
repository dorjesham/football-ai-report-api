import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { bundleLabel, jobStatusLabel } from '../lib/labels';
import HelpTip from '../components/HelpTip';

type Job = {
  id: string;
  kind: string;
  bundleId: string | null;
  status: string;
  progressPct: number;
  stepLabel: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

function statusClass(status: string): string {
  if (status === 'PARTIAL_SUCCESS') return 'partial-success';
  if (status === 'FAILED') return 'status-err';
  if (status === 'SUCCESS' || status === 'SUCCEEDED') return 'status-ok';
  if (status === 'RUNNING') return 'status-warn';
  return '';
}

export default function JobsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api<Job[]>('/admin/api/ingest/jobs?take=50'),
    refetchInterval: 5_000,
  });

  return (
    <>
      <h2 style={{ marginTop: 0 }}>
        任务中心 <HelpTip topic="partialSuccess" />
      </h2>
      <p className="muted">所有批量入库操作均记录为 IngestJobRun，可查看每场明细。</p>
      <button type="button" className="btn secondary" onClick={() => refetch()}>
        刷新
      </button>
      {isLoading && <p>加载中…</p>}
      <table className="card" style={{ marginTop: '1rem' }}>
        <thead>
          <tr>
            <th>状态</th>
            <th>任务</th>
            <th>进度</th>
            <th>步骤</th>
            <th>错误</th>
            <th>开始</th>
          </tr>
        </thead>
        <tbody>
          {(data || []).map((j) => (
            <tr key={j.id}>
              <td className={statusClass(j.status)}>{jobStatusLabel(j.status)}</td>
              <td>
                <Link to={`/jobs/${j.id}`}>{bundleLabel(j.bundleId, j.kind)}</Link>
              </td>
              <td>{j.progressPct}%</td>
              <td>{j.stepLabel || '—'}</td>
              <td>{j.errorMessage?.slice(0, 80) || '—'}</td>
              <td>{new Date(j.startedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
