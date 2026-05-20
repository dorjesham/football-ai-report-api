import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import ConfirmModal from '../components/ConfirmModal';
import HelpTip from '../components/HelpTip';
import { useExpertMode } from '../hooks/useExpertMode';
import { formatApiError } from '../lib/api-errors';
import { reportStatusLabel } from '../lib/labels';

type AiReportRow = {
  id: string;
  matchId: string;
  reportType: string;
  status: string;
  publishedAt: string | null;
  inputHash: string | null;
  freeSummary: string;
  updatedAt: string;
};

type AiReportDetail = AiReportRow & {
  structuredContentJson: unknown;
  disclaimer: string;
};

type TabId = 'pending' | 'published' | 'history' | 'failed' | 'all';

type OpsAiRow = AiReportRow & {
  displayStatus?: string;
  failureReason?: string;
};

export default function AiReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const matchIdFilter = searchParams.get('matchId') || '';
  const initialTab = (searchParams.get('tab') as TabId) || 'pending';
  const [tab, setTab] = useState<TabId>(initialTab);

  useEffect(() => {
    const t = searchParams.get('tab') as TabId | null;
    if (t && ['pending', 'published', 'history', 'failed', 'all'].includes(t)) {
      setTab(t);
    }
  }, [searchParams]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [publishConfirmId, setPublishConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const qc = useQueryClient();
  const { expert, toggle } = useExpertMode();

  const { data: list } = useQuery({
    queryKey: ['ai-reports', matchIdFilter, tab],
    queryFn: async () => {
      if (tab === 'failed') {
        const ops = await api<OpsAiRow[]>(
          `/admin/api/ai/reports/ops-list?tab=failed&take=100`,
        );
        return matchIdFilter ? ops.filter((r) => r.matchId === matchIdFilter) : ops;
      }
      const apiTab =
        tab === 'pending' ? 'draft' : tab === 'published' ? 'published' : 'all';
      const ops = await api<OpsAiRow[]>(
        `/admin/api/ai/reports/ops-list?tab=${apiTab}&take=100`,
      );
      const rows = matchIdFilter ? ops.filter((r) => r.matchId === matchIdFilter) : ops;
      if (tab === 'history') return rows.filter((r) => r.status === 'ARCHIVED');
      return rows;
    },
  });

  const filtered = list ?? [];

  const { data: detail } = useQuery({
    queryKey: ['ai-report', selectedId],
    queryFn: () => api<AiReportDetail>(`/admin/api/ai/reports/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const matchIdForSignals = detail?.matchId ?? matchIdFilter;
  const { data: opsSignals } = useQuery({
    queryKey: ['ops-status', matchIdForSignals],
    queryFn: () =>
      api<{
        aiDataSignals?: {
          predictionsPresent: boolean;
          afComparisonPresent: boolean;
        };
      }>(`/admin/api/matches/${matchIdForSignals}/ops-status`),
    enabled: Boolean(matchIdForSignals) && expert,
  });

  const publish = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/api/ai/reports/${id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      setPublishConfirmId(null);
      setError(null);
      qc.invalidateQueries({ queryKey: ['ai-reports'] });
      qc.invalidateQueries({ queryKey: ['ai-report', selectedId] });
    },
    onError: (err) => setError(formatApiError(err)),
  });

  const archive = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/api/ai/reports/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-reports'] });
      if (selectedId) qc.invalidateQueries({ queryKey: ['ai-report', selectedId] });
    },
    onError: (err) => setError(formatApiError(err)),
  });

  const regenerate = useMutation({
    mutationFn: (opts: { matchId: string; reportType: string }) =>
      api<{ reused?: boolean; id?: string }>(
        `/admin/api/ai/matches/${opts.matchId}/regenerate`,
        {
          method: 'POST',
          body: JSON.stringify({ reportType: opts.reportType }),
        },
      ),
    onSuccess: (res: { reused?: boolean; id?: string }) => {
      setError(null);
      setSuccessMsg(
        res?.reused ? '已覆盖同输入指纹的草稿' : '已生成新草稿',
      );
      qc.invalidateQueries({ queryKey: ['ai-reports'] });
      if (detail) {
        qc.invalidateQueries({ queryKey: ['ai-report', detail.id] });
        qc.invalidateQueries({ queryKey: ['ops-status', detail.matchId] });
      }
      if (res?.id) setSelectedId(res.id);
    },
    onError: (err) => {
      setSuccessMsg(null);
      setError(formatApiError(err));
    },
  });

  return (
    <>
      <h2 style={{ marginTop: 0 }}>
        AI 审核发布 <HelpTip topic="published" />
      </h2>
      <p className="muted">仅 PUBLISHED 报告对 C 端可见。发布会自动归档同场同类型旧稿。</p>
      <button type="button" className="btn secondary expert-toggle" onClick={toggle}>
        专家模式：{expert ? '开' : '关'}
      </button>

      <nav className="tabs">
        {(
          [
            ['pending', '待审核'],
            ['failed', '失败/异常'],
            ['published', '已发布'],
            ['history', '历史版本'],
            ['all', '全部'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          placeholder="按 matchId 筛选"
          value={matchIdFilter}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (v) setSearchParams({ matchId: v });
            else setSearchParams({});
          }}
          style={{ flex: 1, maxWidth: 360 }}
        />
        {matchIdFilter && (
          <Link to={`/matches/${matchIdFilter}`} className="btn secondary">
            单场工作台
          </Link>
        )}
      </div>

      {error && <p className="status-err">{error}</p>}
      {successMsg && <p className="status-ok">{successMsg}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <table className="card">
          <thead>
            <tr>
              <th>类型</th>
              <th>状态</th>
              <th>比赛</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.id}
                title={'failureReason' in r ? (r as OpsAiRow).failureReason : undefined}
                style={{
                  cursor: 'pointer',
                  background: selectedId === r.id ? '#f0f4ff' : undefined,
                }}
                onClick={() => setSelectedId(r.id)}
              >
                <td>{r.reportType}</td>
                <td>
                  {reportStatusLabel(
                    (r as OpsAiRow).displayStatus ?? r.status,
                  )}
                </td>
                <td>
                  <Link to={`/matches/${r.matchId}`} onClick={(e) => e.stopPropagation()}>
                    {r.matchId.slice(0, 10)}…
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {detail && (
          <article className="card">
            <h3 style={{ marginTop: 0 }}>
              {detail.reportType} · {reportStatusLabel(detail.status)}
            </h3>
            {expert && (
              <p className="muted">
                inputHash: {detail.inputHash || '—'}
                {opsSignals?.aiDataSignals != null && (
                  <>
                    {' '}
                    · AF 实力对比:{' '}
                    {opsSignals.aiDataSignals.afComparisonPresent ? '有' : '无'}
                  </>
                )}
              </p>
            )}
            <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
              {detail.freeSummary?.slice(0, 800)}
              {(detail.freeSummary?.length ?? 0) > 800 ? '…' : ''}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              {detail.status !== 'PUBLISHED' && (
                <button
                  type="button"
                  className="btn"
                  disabled={publish.isPending}
                  onClick={() => setPublishConfirmId(detail.id)}
                >
                  发布
                </button>
              )}
              {detail.status === 'PUBLISHED' && expert && (
                <button
                  type="button"
                  className="btn danger"
                  disabled={archive.isPending}
                  onClick={() => archive.mutate(detail.id)}
                >
                  归档
                </button>
              )}
              <button
                type="button"
                className="btn secondary"
                disabled={regenerate.isPending}
                onClick={() =>
                  regenerate.mutate({
                    matchId: detail.matchId,
                    reportType: detail.reportType,
                  })
                }
              >
                重生成草稿
              </button>
            </div>
            {expert && (
              <pre
                style={{
                  marginTop: '1rem',
                  fontSize: '0.7rem',
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(detail.structuredContentJson, null, 2)}
              </pre>
            )}
          </article>
        )}
      </div>

      <ConfirmModal
        open={Boolean(publishConfirmId)}
        title="确认发布 AI 报告"
        onConfirm={() => publishConfirmId && publish.mutate(publishConfirmId)}
        onCancel={() => setPublishConfirmId(null)}
        pending={publish.isPending}
      >
        <p>发布后用户将在比赛详情页看到此报告。</p>
        <p className="muted">同场同类型旧 PUBLISHED 将自动 ARCHIVED。</p>
      </ConfirmModal>
    </>
  );
}
