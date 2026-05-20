import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import {
  fetchMatchEnrichment,
  syncPlayerCatalog,
  syncTeamCatalog,
  type MatchEnrichmentResponse,
} from '../catalog-api';
import CatalogStatusBadge from './CatalogStatusBadge';

type AfStatus = 'present' | 'empty' | 'missing' | 'stale' | 'error';

type CoverageResponse = {
  matchId: string;
  fixtureId?: number;
  syncedAt: string | null;
  coverage: Record<
    string,
    { status: AfStatus; fetchedAt?: string | null; lastError?: string | null }
  > | null;
};

type SyncLogRow = {
  id: string;
  endpoint: string;
  status: string;
  httpStatus: number | null;
  errorMessage: string | null;
  createdAt: string;
  durationMs: number | null;
};

const DASHBOARD_KEYS: { key: string; label: string }[] = [
  { key: 'fixture', label: 'fixture' },
  { key: 'injuries', label: 'injuries' },
  { key: 'predictions', label: 'predictions' },
  { key: 'h2h', label: 'h2h' },
  { key: 'lineups', label: 'lineups' },
  { key: 'oddsLatest', label: 'odds' },
];

function statusBadge(status: AfStatus) {
  const cls = status === 'present' ? 'ok' : 'warn';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export type AfCoverageTab = 'coverage' | 'logs' | 'enrichment';

type Props = {
  matchId: string;
  onClose: () => void;
  tab?: AfCoverageTab;
};

export default function AfCoverageModal({ matchId, onClose, tab = 'coverage' }: Props) {
  const qc = useQueryClient();

  const { data: cov, isLoading: covLoading } = useQuery({
    queryKey: ['af-coverage', matchId],
    queryFn: () => api<CoverageResponse>(`/admin/api/af/matches/${matchId}/coverage`),
    enabled: tab === 'coverage',
  });

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['af-sync-logs', matchId],
    queryFn: () => api<SyncLogRow[]>(`/admin/api/af/matches/${matchId}/sync-logs?limit=50`),
    enabled: tab === 'logs',
  });

  const { data: enrichment, isLoading: enrichLoading } = useQuery({
    queryKey: ['af-enrichment', matchId],
    queryFn: () => fetchMatchEnrichment(matchId),
    enabled: tab === 'enrichment',
  });

  const syncTeam = useMutation({
    mutationFn: ({ teamId, season }: { teamId: string; season: number }) =>
      syncTeamCatalog(teamId, season),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['af-enrichment', matchId] }),
  });

  const syncPlayer = useMutation({
    mutationFn: (playerId: string) => syncPlayerCatalog(playerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['af-enrichment', matchId] }),
  });

  const title =
    tab === 'coverage' ? 'AF Bundle 覆盖率'
    : tab === 'logs' ? 'AF 同步日志'
    : 'B4 / B5 状态';

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-dialog card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: tab === 'enrichment' ? 720 : undefined }}
      >
        <header className="modal-header">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="btn secondary" onClick={onClose}>
            关闭
          </button>
        </header>
        {tab === 'coverage' && (
          <>
            {covLoading && <p className="muted">加载中…</p>}
            {!covLoading && !cov?.coverage && (
              <p className="muted">尚无 bundle，请先执行「AF Raw 全量同步」。</p>
            )}
            {cov?.coverage && (
              <>
                <p className="muted" style={{ fontSize: '0.85rem' }}>
                  fixtureId: {cov.fixtureId ?? '—'} · 最近同步:{' '}
                  {cov.syncedAt ? new Date(cov.syncedAt).toLocaleString() : '—'}
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>字段</th>
                      <th>状态</th>
                      <th>拉取时间</th>
                      <th>错误</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DASHBOARD_KEYS.map(({ key, label }) => {
                      const row = cov.coverage![key];
                      const status = (row?.status ?? 'missing') as AfStatus;
                      return (
                        <tr key={key}>
                          <td>{label}</td>
                          <td>{statusBadge(status)}</td>
                          <td>
                            {row?.fetchedAt ?
                              new Date(row.fetchedAt).toLocaleString()
                            : '—'}
                          </td>
                          <td className="muted" style={{ fontSize: '0.75rem' }}>
                            {row?.lastError?.slice(0, 80) || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
        {tab === 'logs' && (
          <>
            {logsLoading && <p className="muted">加载中…</p>}
            {!logsLoading && (!logs || logs.length === 0) && (
              <p className="muted">暂无同步日志。</p>
            )}
            {logs && logs.length > 0 && (
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>endpoint</th>
                      <th>状态</th>
                      <th>HTTP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td>
                          <code style={{ fontSize: '0.7rem' }}>{log.endpoint}</code>
                        </td>
                        <td>{statusBadge(log.status as AfStatus)}</td>
                        <td>{log.httpStatus ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {tab === 'enrichment' && (
          <EnrichmentPanel
            data={enrichment}
            loading={enrichLoading}
            onSyncTeam={(teamId, season) => syncTeam.mutate({ teamId, season })}
            onSyncPlayer={(playerId) => syncPlayer.mutate(playerId)}
            syncing={syncTeam.isPending || syncPlayer.isPending}
          />
        )}
      </div>
    </div>
  );
}

function EnrichmentPanel({
  data,
  loading,
  onSyncTeam,
  onSyncPlayer,
  syncing,
}: {
  data?: MatchEnrichmentResponse;
  loading: boolean;
  onSyncTeam: (teamId: string, season: number) => void;
  onSyncPlayer: (playerId: string) => void;
  syncing: boolean;
}) {
  if (loading) return <p className="muted">加载中…</p>;
  if (!data) return <p className="muted">无数据</p>;

  const renderTeam = (
    label: string,
    team: MatchEnrichmentResponse['teams']['home'],
  ) => {
    if (!team) return null;
    return (
      <div style={{ marginBottom: '0.75rem' }}>
        <strong>{label}：{team.nameCn}</strong>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: 4 }}>
          <span>转会</span>
          <CatalogStatusBadge status={team.transfers.status} />
          <span>荣誉</span>
          <CatalogStatusBadge status={team.trophies.status} />
          <button
            type="button"
            className="btn secondary"
            style={{ marginLeft: 'auto', fontSize: '0.8rem' }}
            disabled={syncing}
            onClick={() => onSyncTeam(team.teamId, data.season)}
          >
            同步球队 B4
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxHeight: 480, overflow: 'auto' }}>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        赛季 {data.season} · 赛中赔率快照：{data.liveOdds.count} 条
        {data.liveOdds.lastCapturedAt ?
          ` · 最近 ${new Date(data.liveOdds.lastCapturedAt).toLocaleString()}`
        : ''}
      </p>
      {renderTeam('主队', data.teams.home)}
      {renderTeam('客队', data.teams.away)}
      {data.players.length > 0 && (
        <>
          <h4 style={{ marginBottom: '0.5rem' }}>本场球员（B4）</h4>
          <table>
            <thead>
              <tr>
                <th>球员</th>
                <th>荣誉</th>
                <th>缺阵</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.players.map((p) => (
                <tr key={p.playerId}>
                  <td>{p.nameCn}</td>
                  <td>
                    <CatalogStatusBadge status={p.trophies.status} />
                  </td>
                  <td>
                    <CatalogStatusBadge status={p.sidelined.status} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: '0.75rem' }}
                      disabled={syncing}
                      onClick={() => onSyncPlayer(p.playerId)}
                    >
                      同步
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
