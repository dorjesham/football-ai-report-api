import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchLeaguesCatalog,
  syncLeagueCatalog,
  type LeagueB2Fields,
} from '../../catalog-api';
import CatalogStatusBadge from '../../components/CatalogStatusBadge';

const B2_KEYS: Array<{ key: keyof LeagueB2Fields; label: string }> = [
  { key: 'standings', label: '积分榜' },
  { key: 'topAssists', label: '助攻' },
  { key: 'topYellowCards', label: '黄牌' },
  { key: 'topRedCards', label: '红牌' },
  { key: 'fixtureRounds', label: '轮次' },
  { key: 'topscorers', label: '射手' },
];

export default function LeagueCatalogPage() {
  const qc = useQueryClient();
  const [season, setSeason] = useState(2025);
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['leagues-catalog', season],
    queryFn: () => fetchLeaguesCatalog(season),
  });

  const syncMut = useMutation({
    mutationFn: (code: string) => syncLeagueCatalog(code, season),
    onSuccess: (_r, code) => {
      setMessage(`已同步联赛 ${code}`);
      qc.invalidateQueries({ queryKey: ['leagues-catalog', season] });
    },
    onError: (e: Error) => setMessage(e.message),
  });

  return (
    <>
      <h2 style={{ marginTop: 0 }}>AF 联赛 Catalog（B2）</h2>
      <p className="muted">LeagueAfCache：积分榜、助攻/黄牌/红牌榜、轮次等。</p>
      {message && <p className="muted">{message}</p>}
      <CatalogToolbar
        season={season}
        setSeason={setSeason}
        onRefresh={() => refetch()}
        loading={isLoading}
      />
      {isLoading && <p>加载中…</p>}
      {data && (
        <table className="card" style={{ marginTop: '1rem' }}>
          <thead>
            <tr>
              <th>联赛</th>
              {B2_KEYS.map((k) => (
                <th key={k.key}>{k.label}</th>
              ))}
              <th>更新</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((row) => (
              <tr key={row.code ?? row.externalId ?? row.nameCn}>
                <td>
                  <strong>{row.code ?? '—'}</strong>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    {row.nameCn}
                  </div>
                </td>
                {B2_KEYS.map((k) => (
                  <td key={k.key}>
                    <CatalogStatusBadge status={row.fields[k.key]} />
                  </td>
                ))}
                <td style={{ fontSize: '0.8rem' }}>
                  {row.syncedAt ? new Date(row.syncedAt).toLocaleString() : '—'}
                </td>
                <td>
                  {row.code && (
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={syncMut.isPending}
                      onClick={() => syncMut.mutate(row.code!)}
                    >
                      同步 B2
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function CatalogToolbar({
  season,
  setSeason,
  onRefresh,
  loading,
}: {
  season: number;
  setSeason: (n: number) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div
      className="card"
      style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
    >
      <label>
        赛季{' '}
        <input
          type="number"
          value={season}
          onChange={(e) => setSeason(parseInt(e.target.value, 10) || 2025)}
          style={{ width: 80 }}
        />
      </label>
      <button type="button" className="btn secondary" disabled={loading} onClick={onRefresh}>
        刷新
      </button>
    </div>
  );
}
