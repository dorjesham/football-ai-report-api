import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { worldCupApi } from '../../api';

export default function WorldCupLeaderboardsPage() {
  const [metric, setMetric] = useState('goals');
  const standings = useQuery({
    queryKey: ['world-cup-standings'],
    queryFn: () => worldCupApi.standings(2026),
  });
  const boards = useQuery({
    queryKey: ['world-cup-leaderboards', metric],
    queryFn: () => worldCupApi.leaderboards(metric, 2026),
  });

  return (
    <div>
      <h3>小组积分榜</h3>
      {standings.isLoading && <p>加载中…</p>}
      <table className="table" style={{ width: '100%', marginBottom: '1.5rem' }}>
        <thead>
          <tr>
            <th>组</th>
            <th>名次</th>
            <th>球队</th>
            <th>分</th>
          </tr>
        </thead>
        <tbody>
          {((standings.data?.items ?? []) as Array<{
            groupName: string;
            rank: number;
            points: number | null;
            team: { nameCn: string };
          }>).map((r, i) => (
            <tr key={i}>
              <td>{r.groupName}</td>
              <td>{r.rank}</td>
              <td>{r.team?.nameCn}</td>
              <td>{r.points ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>射手/助攻/牌榜</h3>
      <select value={metric} onChange={(e) => setMetric(e.target.value)}>
        <option value="goals">进球</option>
        <option value="assists">助攻</option>
        <option value="yellow_cards">黄牌</option>
        <option value="red_cards">红牌</option>
      </select>
      <table className="table" style={{ width: '100%', marginTop: '0.5rem' }}>
        <thead>
          <tr>
            <th>名次</th>
            <th>球员</th>
            <th>球队</th>
            <th>值</th>
          </tr>
        </thead>
        <tbody>
          {((boards.data?.items ?? []) as Array<{
            rank: number;
            value: number;
            player: { nameCn: string };
            team: { nameCn: string } | null;
          }>).map((r, i) => (
            <tr key={i}>
              <td>{r.rank}</td>
              <td>{r.player?.nameCn}</td>
              <td>{r.team?.nameCn ?? '—'}</td>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
