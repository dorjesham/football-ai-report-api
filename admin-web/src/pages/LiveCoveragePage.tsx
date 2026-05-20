import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';

type LiveCoverage = {
  items: Array<{
    matchId: string;
    homeTeamName: string;
    awayTeamName: string;
    hasEvents?: boolean;
    hasStatistics?: boolean;
  }>;
  summary?: { total?: number };
};

export default function LiveCoveragePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['live-coverage'],
    queryFn: () => api<LiveCoverage>('/admin/api/live/coverage?take=50'),
  });

  if (isLoading) return <p>加载 LIVE 覆盖…</p>;

  return (
    <>
      <p>
        <Link to="/ops/daily/matchday">← 比赛日运维</Link>
      </p>
      <h2 style={{ marginTop: 0 }}>进行中比赛数据覆盖</h2>
      <p className="muted">共 {data?.summary?.total ?? data?.items?.length ?? 0} 场</p>
      <table className="card">
        <thead>
          <tr>
            <th>对阵</th>
            <th>事件</th>
            <th>统计</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(data?.items ?? []).map((row) => (
            <tr key={row.matchId}>
              <td>
                {row.homeTeamName} vs {row.awayTeamName}
              </td>
              <td>{row.hasEvents ? '有' : '缺'}</td>
              <td>{row.hasStatistics ? '有' : '缺'}</td>
              <td>
                <Link to={`/matches/${row.matchId}`} className="btn secondary">
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
