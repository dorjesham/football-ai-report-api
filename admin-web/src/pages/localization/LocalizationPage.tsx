import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { localizationApi } from '../../api';

type TranslationRow = {
  id: string;
  entityType: string;
  externalId: string | null;
  translatedText: string;
  status: string;
  source: string;
  locked: boolean;
};

export default function LocalizationPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('draft');
  const [entityFilter, setEntityFilter] = useState<string>('');
  const [msg, setMsg] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: ['l10n-overview'],
    queryFn: () => localizationApi.overview('WC'),
  });

  const list = useQuery({
    queryKey: ['l10n-translations', statusFilter, entityFilter],
    queryFn: () =>
      localizationApi.listTranslations({
        status: statusFilter || undefined,
        entityType: entityFilter || undefined,
        take: 80,
      }) as Promise<TranslationRow[]>,
  });

  const approve = useMutation({
    mutationFn: (id: string) => localizationApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['l10n-translations'] });
      qc.invalidateQueries({ queryKey: ['l10n-overview'] });
    },
  });

  const reject = useMutation({
    mutationFn: (id: string) => localizationApi.reject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['l10n-translations'] }),
  });

  const seed = useMutation({
    mutationFn: () => localizationApi.applySeed(),
    onSuccess: (d) => {
      setMsg(`种子已应用：${JSON.stringify(d.stats)}`);
      qc.invalidateQueries({ queryKey: ['l10n-overview'] });
    },
  });

  const backfill = useMutation({
    mutationFn: () => localizationApi.backfill({ competitionCodes: ['WC'] }),
    onSuccess: () => {
      setMsg('回填完成');
      qc.invalidateQueries({ queryKey: ['l10n-overview'] });
    },
  });

  const llmDraft = useMutation({
    mutationFn: () => localizationApi.llmDraft({ limit: 30 }),
    onSuccess: (d) => {
      setMsg(`LLM 草案：处理 ${d.processed}，跳过 ${d.skipped}，错误 ${d.errors}`);
      qc.invalidateQueries({ queryKey: ['l10n-translations'] });
    },
  });

  const ov = overview.data;

  return (
    <div>
      <h2>中文本地化</h2>
      <p className="muted">EntityTranslation 审核、种子、回填与 LLM 草案（Deepseek）。</p>
      {msg ? <p className="ok">{msg}</p> : null}

      <div className="cards" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', margin: '1rem 0' }}>
        <div className="card" style={{ minWidth: 140 }}>
          <strong>球队覆盖率</strong>
          <p>{ov ? `${ov.teamPct}% (${ov.teams.translated}/${ov.teams.total})` : '…'}</p>
        </div>
        <div className="card" style={{ minWidth: 140 }}>
          <strong>球员覆盖率</strong>
          <p>{ov ? `${ov.playerPct}% (${ov.players.translated}/${ov.players.total})` : '…'}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button type="button" className="btn" disabled={seed.isPending} onClick={() => seed.mutate()}>
          应用种子
        </button>
        <button type="button" className="btn secondary" disabled={backfill.isPending} onClick={() => backfill.mutate()}>
          WC 回填
        </button>
        <button type="button" className="btn secondary" disabled={llmDraft.isPending} onClick={() => llmDraft.mutate()}>
          LLM 草案（≤30）
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <label>
          状态{' '}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部</option>
            <option value="draft">draft</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>
        </label>
        <label>
          类型{' '}
          <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
            <option value="">全部</option>
            <option value="team">team</option>
            <option value="player">player</option>
            <option value="competition">competition</option>
            <option value="referee">referee</option>
          </select>
        </label>
      </div>

      <table className="table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>类型</th>
            <th>externalId</th>
            <th>译文</th>
            <th>状态</th>
            <th>来源</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((r) => (
            <tr key={r.id}>
              <td>{r.entityType}</td>
              <td>{r.externalId ?? '—'}</td>
              <td>{r.translatedText}</td>
              <td>
                {r.status}
                {r.locked ? ' 🔒' : ''}
              </td>
              <td>{r.source}</td>
              <td>
                {r.status === 'draft' && !r.locked ? (
                  <>
                    <button type="button" className="btn" onClick={() => approve.mutate(r.id)}>
                      通过
                    </button>{' '}
                    <button type="button" className="btn secondary" onClick={() => reject.mutate(r.id)}>
                      驳回
                    </button>
                  </>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
