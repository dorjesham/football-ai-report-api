import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { api } from '../api';
import ConfirmModal from '../components/ConfirmModal';
import { bundleLabel, jobStatusLabel } from '../lib/labels';
import { useExpertMode } from '../hooks/useExpertMode';
import { formatApiError } from '../lib/api-errors';

type JobItem = {
  id: string;
  matchId: string | null;
  status: string;
  currentStep: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

type JobDetail = {
  id: string;
  kind: string;
  bundleId: string | null;
  status: string;
  progressPct: number;
  stepLabel: string | null;
  errorMessage: string | null;
  resultSummary: Record<string, unknown> | null;
  startedAt: string;
  finishedAt: string | null;
  items: JobItem[];
  itemsTotal: number;
};

type BundleDef = {
  id: string;
  steps: Array<{ id: string; label: string }>;
};

export default function JobDetailPage() {
  const { jobId = '' } = useParams();
  const { expert } = useExpertMode();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const { data: bundles } = useQuery({
    queryKey: ['ingest-bundles'],
    queryFn: () => api<BundleDef[]>('/admin/api/ingest/bundles'),
  });

  const stepLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bundles ?? []) {
      for (const s of b.steps ?? []) {
        m.set(s.id, s.label);
      }
    }
    return m;
  }, [bundles]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api<JobDetail>(`/admin/api/ingest/jobs/${jobId}?itemsTake=500`),
    enabled: Boolean(jobId),
    refetchInterval: (q) =>
      q.state.data?.status === 'RUNNING' ? 5_000 : false,
  });

  const retryFailed = useMutation({
    mutationFn: () =>
      api(`/admin/api/ingest/jobs/${jobId}/retry-failed`, { method: 'POST' }),
    onSuccess: () => refetch(),
  });

  const cancelJob = useMutation({
    mutationFn: () =>
      api(`/admin/api/ingest/jobs/${jobId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      setConfirmCancel(false);
      refetch();
    },
  });

  if (!jobId) return <p>缺少 jobId</p>;
  if (isLoading) return <p>加载中…</p>;
  if (!data) return <p>未找到任务</p>;

  const statusClass =
    data.status === 'PARTIAL_SUCCESS' ? 'partial-success' : data.status.toLowerCase();

  const currentStepHuman =
    data.stepLabel && stepLabelMap.get(data.stepLabel)
      ? stepLabelMap.get(data.stepLabel)
      : data.stepLabel;

  return (
    <>
      <p>
        <Link to="/jobs">← 任务中心</Link>
      </p>
      <h2 style={{ marginTop: '0.5rem' }}>
        任务 {bundleLabel(data.bundleId, data.kind)}
      </h2>
      <p className="muted">
        <span className={statusClass}>{jobStatusLabel(data.status)}</span> ·{' '}
        {data.progressPct}% · {currentStepHuman || '—'}
      </p>
      {data.resultSummary && Object.keys(data.resultSummary).length > 0 && (
        <article className="card">
          <h3 style={{ marginTop: 0 }}>结果摘要</h3>
          <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(data.resultSummary, null, 2)}
          </pre>
        </article>
      )}
      {data.errorMessage && (
        <p className="muted" style={{ color: '#c44' }}>
          {data.errorMessage}
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn secondary" onClick={() => refetch()}>
          刷新
        </button>
        {expert && data.status === 'RUNNING' && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => setConfirmCancel(true)}
          >
            取消任务
          </button>
        )}
        {expert &&
          (data.status === 'PARTIAL_SUCCESS' || data.status === 'FAILED') && (
            <button
              type="button"
              className="btn"
              disabled={retryFailed.isPending}
              onClick={() => retryFailed.mutate()}
            >
              重跑失败场
            </button>
          )}
      </div>
      {retryFailed.error && (
        <p className="status-err">{formatApiError(retryFailed.error)}</p>
      )}

      <h3>每场明细 ({data.itemsTotal})</h3>
      <table className="card">
        <thead>
          <tr>
            <th>比赛</th>
            <th>状态</th>
            <th>步骤</th>
            <th>错误</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.matchId ? (
                  <>
                    <Link to={`/matches/${item.matchId}`}>
                      {item.matchId.slice(0, 12)}…
                    </Link>
                    {expert && (
                      <>
                        {' '}
                        <a
                          className="muted"
                          href={`/admin/api/af/sync-logs?matchId=${item.matchId}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          日志
                        </a>
                      </>
                    )}
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td>{item.status}</td>
              <td>
                {item.currentStep
                  ? stepLabelMap.get(item.currentStep) ?? item.currentStep
                  : '—'}
                {expert && item.errorCode && (
                  <span className="muted"> ({item.errorCode})</span>
                )}
              </td>
              <td>{item.errorMessage?.slice(0, 60) || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ConfirmModal
        open={confirmCancel}
        title="确认取消任务"
        onConfirm={() => cancelJob.mutate()}
        onCancel={() => setConfirmCancel(false)}
        pending={cancelJob.isPending}
      >
        <p>仅 RUNNING 任务可取消，取消后状态为 CANCELED。</p>
      </ConfirmModal>
    </>
  );
}
