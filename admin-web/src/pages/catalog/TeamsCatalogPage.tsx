import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchAfTeams,
  fetchTeamCatalog,
  syncTeamCatalog,
  type TeamCatalogResponse,
} from '../../catalog-api';
import CatalogStatusBadge from '../../components/CatalogStatusBadge';

export default function TeamsCatalogPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [season, setSeason] = useState(2025);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: list, isLoading } = useQuery({
    queryKey: ['af-teams', q],
    queryFn: () => fetchAfTeams(q),
  });

  const { data: detail } = useQuery({
    queryKey: ['team-catalog', selectedId, season],
    queryFn: () => fetchTeamCatalog(selectedId!, season),
    enabled: !!selectedId,
  });

  const syncMut = useMutation({
    mutationFn: (teamId: string) => syncTeamCatalog(teamId, season),
    onSuccess: () => {
      setMessage('B4 球队档案同步完成');
      qc.invalidateQueries({ queryKey: ['team-catalog', selectedId, season] });
    },
    onError: (e: Error) => setMessage(e.message),
  });

  return (
    <>
      <h2 style={{ marginTop: 0 }}>AF 球队档案（B4）</h2>
      <p className="muted">转会 + 荣誉 Raw 表。</p>
      {message && <p className="muted">{message}</p>}
      <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          placeholder="搜索球队名或 ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 200 }}
        />
        <label>
          转会赛季{' '}
          <input
            type="number"
            value={season}
            onChange={(e) => setSeason(parseInt(e.target.value, 10) || 2025)}
            style={{ width: 80 }}
          />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
        <div>
          {isLoading && <p>加载中…</p>}
          <table className="card">
            <thead>
              <tr>
                <th>球队</th>
                <th>externalId</th>
              </tr>
            </thead>
            <tbody>
              {(list?.items ?? []).map((t) => (
                <tr
                  key={t.id}
                  style={{ cursor: 'pointer', background: selectedId === t.id ? '#1a2a3a' : undefined }}
                  onClick={() => setSelectedId(t.id)}
                >
                  <td>{t.nameCn}</td>
                  <td>
                    <code style={{ fontSize: '0.7rem' }}>{t.externalId}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          {!selectedId && <p className="muted">选择左侧球队查看 B4 状态</p>}
          {detail && (
            <TeamDetailPanel
              detail={detail}
              onSync={() => syncMut.mutate(detail.teamId)}
              syncing={syncMut.isPending}
            />
          )}
        </div>
      </div>
    </>
  );
}

function TeamDetailPanel({
  detail,
  onSync,
  syncing,
}: {
  detail: TeamCatalogResponse;
  onSync: () => void;
  syncing: boolean;
}) {
  return (
    <div className="card" style={{ padding: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>{detail.nameCn}</h3>
      <p className="muted">
        <code>{detail.externalId}</code> · 赛季 {detail.season}
      </p>
      <table>
        <tbody>
          <tr>
            <td>转会</td>
            <td>
              <CatalogStatusBadge status={detail.transfers.status} />
            </td>
            <td className="muted" style={{ fontSize: '0.75rem' }}>
              {detail.transfers.syncedAt ?
                new Date(detail.transfers.syncedAt).toLocaleString()
              : '—'}
            </td>
          </tr>
          <tr>
            <td>荣誉</td>
            <td>
              <CatalogStatusBadge status={detail.trophies.status} />
            </td>
            <td className="muted" style={{ fontSize: '0.75rem' }}>
              {detail.trophies.syncedAt ?
                new Date(detail.trophies.syncedAt).toLocaleString()
              : '—'}
            </td>
          </tr>
        </tbody>
      </table>
      <button
        type="button"
        className="btn"
        style={{ marginTop: '0.75rem' }}
        disabled={syncing}
        onClick={onSync}
      >
        同步 B4
      </button>
    </div>
  );
}
