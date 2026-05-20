import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { api, worldCupApi } from '../../api';

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

type CoverageDetail = {
  matchId: string;
  status: string;
  score: number;
  endpoints: Array<{ id: string; label: string; status: string; message?: string }>;
  gates: { aiPublishable: boolean; reasons: string[] };
};

export default function WorldCupMatchesPage() {
  const qc = useQueryClient();
  const [coverageFilter, setCoverageFilter] = useState('');
  const [modalMatchId, setModalMatchId] = useState<string | null>(null);

  const matches = useQuery({
    queryKey: ['world-cup-matches', coverageFilter],
    queryFn: () =>
      worldCupApi.matches(
        coverageFilter ? { coverage: coverageFilter as 'red' | 'yellow' | 'green' } : {},
      ) as Promise<{ items: MatchRow[] }>,
  });

  const coverageDetail = useQuery({
    queryKey: ['world-cup-coverage', modalMatchId],
    queryFn: () => worldCupApi.matchCoverage(modalMatchId!) as Promise<CoverageDetail>,
    enabled: Boolean(modalMatchId),
  });

  const reconcile = useMutation({
    mutationFn: (matchId: string) => worldCupApi.reconcile(matchId, { includeAi: false }),
    onSuccess: (data) => {
      if (data.jobId) window.location.href = `/jobs/${data.jobId}`;
    },
  });

  return (
    <div>
      <label>
        筛选覆盖度{' '}
        <select value={coverageFilter} onChange={(e) => setCoverageFilter(e.target.value)}>
          <option value="">全部</option>
          <option value="red">红</option>
          <option value="yellow">黄</option>
          <option value="green">绿</option>
        </select>
      </label>
      <table className="table" style={{ marginTop: '0.5rem', width: '100%' }}>
        <thead>
          <tr>
            <th>开球</th>
            <th>对阵</th>
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
              <td>{m.coverageStatus}</td>
              <td>{m.isAiPublishable ? '通过' : m.missingReasons.join(', ') || '未通过'}</td>
              <td>
                <button type="button" className="btn secondary" onClick={() => setModalMatchId(m.matchId)}>
                  Coverage
                </button>{' '}
                <Link to={`/matches/${m.matchId}`}>详情</Link>{' '}
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => reconcile.mutate(m.matchId)}
                >
                  补全
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modalMatchId && (
        <div className="modal-backdrop" role="dialog">
          <div className="modal-panel card" style={{ maxWidth: 560 }}>
            <h3 style={{ marginTop: 0 }}>Coverage · {modalMatchId.slice(0, 8)}…</h3>
            {coverageDetail.isLoading && <p>加载中…</p>}
            {coverageDetail.data && (
              <>
                <p>
                  状态 <strong>{coverageDetail.data.status}</strong> · 分数{' '}
                  {coverageDetail.data.score} · 发布门禁{' '}
                  {coverageDetail.data.gates.aiPublishable ? '通过' : '未通过'}
                </p>
                {coverageDetail.data.gates.reasons.length > 0 && (
                  <p className="muted">原因: {coverageDetail.data.gates.reasons.join(', ')}</p>
                )}
                <ul style={{ fontSize: '0.9rem', maxHeight: 240, overflow: 'auto' }}>
                  {coverageDetail.data.endpoints.map((e) => (
                    <li key={e.id}>
                      {e.label} — {e.status}
                      {e.message ? ` (${e.message})` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <button type="button" className="btn secondary" onClick={() => setModalMatchId(null)}>
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
