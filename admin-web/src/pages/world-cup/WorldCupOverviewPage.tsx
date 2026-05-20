import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { worldCupApi } from '../../api';
import { jobStatusLabel } from '../../lib/labels';

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

export default function WorldCupOverviewPage() {
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: ['world-cup-overview'],
    queryFn: () => worldCupApi.overview() as Promise<Overview>,
  });
  const o = overview.data;

  return (
    <div>
      <p className="muted">
        球队 externalId 为 <code>af-t-*</code>，比赛为 <code>af-f-*</code>；ELO / wc26 JSON 已废弃。
      </p>
      {o && (
        <>
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}
          >
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
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            AF Key: {o.env.afConfigured ? '已配置' : '未配置'} · QWeather:{' '}
            {o.env.qweatherConfigured ? '已配置' : '未配置'} · Facts 双写:{' '}
            {o.env.factsDualWrite ? '开' : '关'} · 预测: {o.env.predictionProvider ?? 'af'}
          </p>
          {o.recentJobs?.length ? (
            <section style={{ marginTop: '1rem' }}>
              <h3>最近任务</h3>
              <ul>
                {o.recentJobs.map((j) => (
                  <li key={j.id}>
                    <Link to={`/jobs/${j.id}`}>{j.name}</Link> — {jobStatusLabel(j.status)} (
                    {j.progress}%)
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      <button
        type="button"
        className="btn secondary"
        style={{ marginTop: '0.5rem' }}
        onClick={() => qc.invalidateQueries({ queryKey: ['world-cup-overview'] })}
      >
        刷新
      </button>
    </div>
  );
}
