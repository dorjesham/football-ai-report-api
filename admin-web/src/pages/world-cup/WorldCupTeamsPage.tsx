import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { worldCupApi } from '../../api';

type TeamRow = {
  teamId: string;
  apiFootballTeamId: number | null;
  name: string;
  hasSquad: boolean;
  playerCount: number;
};

export default function WorldCupTeamsPage() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<number | null>(null);
  const [nameCn, setNameCn] = useState('');
  const [manualTeamId, setManualTeamId] = useState('');
  const [editorNote, setEditorNote] = useState('');

  const teams = useQuery({
    queryKey: ['world-cup-teams'],
    queryFn: () => worldCupApi.teams() as Promise<{ items: TeamRow[] }>,
  });

  const saveName = useMutation({
    mutationFn: () => worldCupApi.upsertTeamNameOverride(editId!, nameCn),
    onSuccess: () => {
      setEditId(null);
      qc.invalidateQueries({ queryKey: ['world-cup-teams'] });
    },
  });

  const refresh = useMutation({
    mutationFn: (teamId: string) => worldCupApi.refreshTeamProfile(teamId),
    onSuccess: (d) => {
      if (d.jobId) window.location.href = `/jobs/${d.jobId}`;
    },
  });

  const saveManual = useMutation({
    mutationFn: () =>
      worldCupApi.patchTeamManual(manualTeamId, {
        editorNote,
        storyTags: [],
      }),
    onSuccess: () => {
      setEditorNote('');
      qc.invalidateQueries({ queryKey: ['world-cup-teams'] });
    },
  });

  return (
    <div>
      <p className="muted">
        中文名映射写入后，下次 teams_af 同步会应用到 nameCn；成功保存时已双写 EntityTranslation。
      </p>
      <table className="table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>AF ID</th>
            <th>名称</th>
            <th>名单</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {(teams.data?.items ?? []).map((t) => (
            <tr key={t.teamId}>
              <td>{t.apiFootballTeamId ?? '—'}</td>
              <td>{t.name}</td>
              <td>{t.hasSquad ? `${t.playerCount} 人` : '无'}</td>
              <td>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setEditId(t.apiFootballTeamId ?? null);
                    setNameCn(t.name);
                  }}
                >
                  中文名
                </button>{' '}
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => refresh.mutate(t.teamId)}
                >
                  刷新档案
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editId != null && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3>中文名 · af-t-{editId}</h3>
          <input
            value={nameCn}
            onChange={(e) => setNameCn(e.target.value)}
            style={{ width: '100%', marginBottom: '0.5rem' }}
          />
          <button type="button" className="btn primary" onClick={() => saveName.mutate()}>
            保存
          </button>{' '}
          <button type="button" className="btn secondary" onClick={() => setEditId(null)}>
            取消
          </button>
        </div>
      )}

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>手工 profile（editorNote）</h3>
        <input
          placeholder="teamId (cuid)"
          value={manualTeamId}
          onChange={(e) => setManualTeamId(e.target.value)}
          style={{ width: '100%', marginBottom: '0.5rem' }}
        />
        <textarea
          value={editorNote}
          onChange={(e) => setEditorNote(e.target.value)}
          rows={4}
          style={{ width: '100%' }}
        />
        <button
          type="button"
          className="btn primary"
          style={{ marginTop: '0.5rem' }}
          onClick={() => saveManual.mutate()}
        >
          保存 manual
        </button>
      </div>
    </div>
  );
}
