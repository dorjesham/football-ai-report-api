import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchAfPlayers,
  fetchPlayerCatalog,
  syncPlayerCatalog,
  type PlayerCatalogResponse,
} from '../../catalog-api';
import CatalogStatusBadge from '../../components/CatalogStatusBadge';

export default function PlayersCatalogPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: list, isLoading } = useQuery({
    queryKey: ['af-players', q],
    queryFn: () => fetchAfPlayers(q),
  });

  const { data: detail } = useQuery({
    queryKey: ['player-catalog', selectedId],
    queryFn: () => fetchPlayerCatalog(selectedId!),
    enabled: !!selectedId,
  });

  const syncMut = useMutation({
    mutationFn: (playerId: string) => syncPlayerCatalog(playerId),
    onSuccess: () => {
      setMessage('B4 球员档案同步完成');
      qc.invalidateQueries({ queryKey: ['player-catalog', selectedId] });
    },
    onError: (e: Error) => setMessage(e.message),
  });

  return (
    <>
      <h2 style={{ marginTop: 0 }}>AF 球员档案（B4）</h2>
      <p className="muted">荣誉 + 长期缺阵 Raw 表。</p>
      {message && <p className="muted">{message}</p>}
      <div className="card" style={{ padding: '0.75rem 1rem' }}>
        <input
          placeholder="搜索球员名或 ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 240 }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
        <div>
          {isLoading && <p>加载中…</p>}
          <table className="card">
            <thead>
              <tr>
                <th>球员</th>
                <th>externalId</th>
              </tr>
            </thead>
            <tbody>
              {(list?.items ?? []).map((p) => (
                <tr
                  key={p.id}
                  style={{ cursor: 'pointer', background: selectedId === p.id ? '#1a2a3a' : undefined }}
                  onClick={() => setSelectedId(p.id)}
                >
                  <td>{p.nameCn}</td>
                  <td>
                    <code style={{ fontSize: '0.7rem' }}>{p.externalId}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          {!selectedId && <p className="muted">选择左侧球员查看 B4 状态</p>}
          {detail && (
            <PlayerDetailPanel
              detail={detail}
              onSync={() => syncMut.mutate(detail.playerId)}
              syncing={syncMut.isPending}
            />
          )}
        </div>
      </div>
    </>
  );
}

function PlayerDetailPanel({
  detail,
  onSync,
  syncing,
}: {
  detail: PlayerCatalogResponse;
  onSync: () => void;
  syncing: boolean;
}) {
  return (
    <div className="card" style={{ padding: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>{detail.nameCn}</h3>
      <p className="muted">
        <code>{detail.externalId}</code>
      </p>
      <table>
        <tbody>
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
          <tr>
            <td>缺阵</td>
            <td>
              <CatalogStatusBadge status={detail.sidelined.status} />
            </td>
            <td className="muted" style={{ fontSize: '0.75rem' }}>
              {detail.sidelined.syncedAt ?
                new Date(detail.sidelined.syncedAt).toLocaleString()
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
