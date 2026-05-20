import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api';

type OpsRow = {
  id: string;
  kickoffTime: string;
  status: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionCode: string | null;
  coverageHealth: 'green' | 'yellow' | 'red';
  aiSummary: string;
  hasFailedJob: boolean;
};

function healthDot(h: string) {
  const c = h === 'green' ? '#2a9d5c' : h === 'yellow' ? '#e9c46a' : '#e76f51';
  return <span style={{ color: c }}>●</span>;
}

export default function MatchesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [coverageHealth, setCoverageHealth] = useState(
    searchParams.get('coverageHealth') || '',
  );
  const [aiStatus, setAiStatus] = useState(searchParams.get('aiStatus') || '');
  const kickoffFrom = searchParams.get('kickoffFrom') || '';
  const kickoffTo = searchParams.get('kickoffTo') || '';

  useEffect(() => {
    setStatus(searchParams.get('status') || '');
    setCoverageHealth(searchParams.get('coverageHealth') || '');
    setAiStatus(searchParams.get('aiStatus') || '');
  }, [searchParams]);

  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (kickoffFrom) qs.set('kickoffFrom', kickoffFrom);
  if (kickoffTo) qs.set('kickoffTo', kickoffTo);
  if (coverageHealth) qs.set('coverageHealth', coverageHealth);
  if (aiStatus) qs.set('aiStatus', aiStatus);
  qs.set('take', '100');

  const { data, refetch } = useQuery({
    queryKey: ['matches-ops', qs.toString()],
    queryFn: () =>
      api<{ items: OpsRow[] }>(`/admin/api/matches/ops-list?${qs.toString()}`),
  });

  const applyFilters = () => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (kickoffFrom) p.set('kickoffFrom', kickoffFrom);
    if (kickoffTo) p.set('kickoffTo', kickoffTo);
    if (coverageHealth) p.set('coverageHealth', coverageHealth);
    if (aiStatus) p.set('aiStatus', aiStatus);
    setSearchParams(p);
  };

  return (
    <>
      <h2 style={{ marginTop: 0 }}>比赛中心</h2>
      <p className="muted">
        筛选健康度、AI 状态后进入单场工作台（sync-full、发布、用户预览）。
      </p>
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="SCHEDULED">未开赛</option>
          <option value="LIVE">进行中</option>
          <option value="FINISHED">已结束</option>
        </select>
        <select value={coverageHealth} onChange={(e) => setCoverageHealth(e.target.value)}>
          <option value="">健康度</option>
          <option value="green">绿</option>
          <option value="yellow">黄</option>
          <option value="red">红</option>
        </select>
        <select value={aiStatus} onChange={(e) => setAiStatus(e.target.value)}>
          <option value="">AI</option>
          <option value="none">无</option>
          <option value="draft">待审</option>
          <option value="published">已发布</option>
          <option value="failed">异常</option>
        </select>
        <button type="button" className="btn" onClick={applyFilters}>
          应用筛选
        </button>
        <button type="button" className="btn secondary" onClick={() => refetch()}>
          刷新
        </button>
      </div>
      {(kickoffFrom || kickoffTo) && (
        <p className="muted">
          开球范围：{kickoffFrom ? new Date(kickoffFrom).toLocaleString() : '—'} →{' '}
          {kickoffTo ? new Date(kickoffTo).toLocaleString() : '—'}
        </p>
      )}
      <table className="card">
        <thead>
          <tr>
            <th>健康</th>
            <th>开球</th>
            <th>对阵</th>
            <th>联赛</th>
            <th>状态</th>
            <th>AI</th>
            <th>任务</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(data?.items || []).map((m) => (
            <tr key={m.id}>
              <td>{healthDot(m.coverageHealth)}</td>
              <td>{new Date(m.kickoffTime).toLocaleString()}</td>
              <td>
                {m.homeTeamName} vs {m.awayTeamName}
              </td>
              <td>{m.competitionCode || '—'}</td>
              <td>{m.status}</td>
              <td>{m.aiSummary}</td>
              <td>{m.hasFailedJob ? '失败' : '—'}</td>
              <td>
                <Link to={`/matches/${m.id}`} className="btn secondary">
                  工作台
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
