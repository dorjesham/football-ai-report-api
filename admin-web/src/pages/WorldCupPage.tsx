import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { api, worldCupApi } from '../api';
import ConfirmModal from '../components/ConfirmModal';
import { jobStatusLabel } from '../lib/labels';

type Overview = {
  season: number;
  totalMatches: number;
  teamsCount: number;
  coverage: { green: number; yellow: number; red: number };
  gates: { aiPublishable: number; aiBlocked: number };
  env: {
    afConfigured: boolean;
    qweatherConfigured: boolean;
    factsDualWrite: boolean;
    predictionProvider?: string;
  };
  recentJobs: Array<{
    id: string;
    name: string;
    status: string;
    progress: number;
    startedAt: string;
  }>;
};

type MatchRow = {
  matchId: string;
  externalId: string | null;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  coverageStatus: string;
  isAiPublishable: boolean;
  missingReasons: string[];
};

export default function WorldCupPage() {
  const qc = useQueryClient();
  const [confirmBootstrap, setConfirmBootstrap] = useState(false);
  const [coverageFilter, setCoverageFilter] = useState<string>('');

  const overview = useQuery({
    queryKey: ['world-cup-overview'],
    queryFn: () => api<Overview>('/admin/api/world-cup/overview'),
  });

  const matches = useQuery({
    queryKey: ['world-cup-matches', coverageFilter],
    queryFn: () =>
      api<{ items: MatchRow[] }>(
        `/admin/api/world-cup/matches${coverageFilter ? `?coverage=${coverageFilter}` : ''}`,
      ),
  });

  const batchPredictions = useMutation({
    mutationFn: () => worldCupApi.generatePredictions({ onlyMissing: true }),
    onSuccess: (data) => {
      if (data.jobId) window.location.href = `/jobs/${data.jobId}`;
    },
  });

  const batchAiDrafts = useMutation({
    mutationFn: () =>
      worldCupApi.generateAiDrafts({ onlyPublishable: true, forceRegenerateDraft: false }),
    onSuccess: (data) => {
      if (data.jobId) window.location.href = `/jobs/${data.jobId}`;
    },
  });

  const bootstrap = useMutation({
    mutationFn: () =>
      worldCupApi.bootstrap({ season: 2026, maxParallel: 3, generateAiDrafts: false }),
    onSuccess: (data) => {
      setConfirmBootstrap(false);
      qc.invalidateQueries({ queryKey: ['world-cup-overview'] });
      window.location.href = `/jobs/${data.jobId}`;
    },
  });

  const reconcile = useMutation({
    mutationFn: (matchId: string) =>
      api<{ jobId: string }>(`/admin/api/world-cup/matches/${matchId}/reconcile`, {
        method: 'POST',
        body: JSON.stringify({ includeAi: false }),
      }),
    onSuccess: (data) => {
      if (data.jobId) window.location.href = `/jobs/${data.jobId}`;
    },
  });

  const o = overview.data;

  return (
    <div>
      <h2>世界杯 2026（AF 唯一数据源）</h2>
      <p className="muted">
        全量入库、覆盖度门禁与 AF 预测；旧 wc26 JSON / ELO 已废弃。AI 草稿默认在 Bootstrap 后按需生成。
      </p>

      {o && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {[
            ['场次', o.totalMatches],
            ['球队', o.teamsCount],
            ['可发布 AI', o.gates.aiPublishable],
            ['覆盖绿', o.coverage.green],
            ['覆盖黄', o.coverage.yellow],
            ['覆盖红', o.coverage.red],
          ].map(([label, val]) => (
            <div key={String(label)} className="card stat">
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                {label}
              </p>
              <strong style={{ fontSize: '1.35rem' }}>{val}</strong>
            </div>
          ))}
        </div>
      )}

      {o && (
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          AF Key: {o.env.afConfigured ? '已配置' : '未配置'} · QWeather:{' '}
          {o.env.qweatherConfigured ? '已配置' : '未配置'} · Facts 双写:{' '}
          {o.env.factsDualWrite ? '开' : '关'} · 预测: {o.env.predictionProvider ?? 'af'}
        </p>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn primary" onClick={() => setConfirmBootstrap(true)}>
          一键 Bootstrap（13 步）
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ['world-cup-overview'] });
            qc.invalidateQueries({ queryKey: ['world-cup-matches'] });
          }}
        >
          刷新
        </button>
        <Link to="/jobs" className="btn secondary">
          任务中心
        </Link>
        <button
          type="button"
          className="btn secondary"
          disabled={batchPredictions.isPending}
          onClick={() => batchPredictions.mutate()}
        >
          批量 AF 预测
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={batchAiDrafts.isPending}
          onClick={() => batchAiDrafts.mutate()}
        >
          批量 AI 草稿（仅门禁通过）
        </button>
      </div>

      {o?.recentJobs?.length ? (
        <section style={{ marginTop: '1.5rem' }}>
          <h3>最近任务</h3>
          <ul>
            {o.recentJobs.map((j) => (
              <li key={j.id}>
                <Link to={`/jobs/${j.id}`}>{j.name}</Link> — {jobStatusLabel(j.status)} ({j.progress}%)
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section style={{ marginTop: '1.5rem' }}>
        <h3>赛程与覆盖度</h3>
        <label>
          筛选覆盖度{' '}
          <select value={coverageFilter} onChange={(e) => setCoverageFilter(e.target.value)}>
            <option value="">全部</option>
            <option value="red">红</option>
            <option value="yellow">黄</option>
            <option value="green">绿</option>
          </select>
        </label>
        {matches.isLoading && <p>加载中…</p>}
        <table className="table" style={{ marginTop: '0.5rem', width: '100%' }}>
          <thead>
            <tr>
              <th>开球</th>
              <th>对阵</th>
              <th>状态</th>
              <th>覆盖</th>
              <th>AI 门禁</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {(matches.data?.items ?? []).map((m) => (
              <tr key={m.matchId}>
                <td>{new Date(m.kickoffAt).toLocaleString()}</td>
                <td>
                  {m.homeTeam} vs {m.awayTeam}
                </td>
                <td>{m.status}</td>
                <td>{m.coverageStatus}</td>
                <td>{m.isAiPublishable ? '通过' : m.missingReasons.join(', ') || '未通过'}</td>
                <td>
                  <Link to={`/matches/${m.matchId}`}>详情</Link>{' '}
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ marginLeft: 4 }}
                    onClick={() => reconcile.mutate(m.matchId)}
                  >
                    补全
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ConfirmModal
        open={confirmBootstrap}
        title="运行世界杯 AF 全量 Bootstrap？"
        confirmLabel="开始"
        onConfirm={() => bootstrap.mutate()}
        onCancel={() => setConfirmBootstrap(false)}
        pending={bootstrap.isPending}
      >
        <p className="muted" style={{ margin: 0 }}>
          将依次同步 WC 赛程、球队、名单、积分榜、单场 AF 全量、赛前快照、AF 预测与天气（T24）。默认不批量生成
          AI 草稿。任务较长，请在任务中心查看。
        </p>
      </ConfirmModal>
    </div>
  );
}
