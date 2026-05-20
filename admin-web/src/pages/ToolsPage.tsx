import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../api';
import ConfirmModal from '../components/ConfirmModal';
import HelpTip from '../components/HelpTip';
import { useExpertMode } from '../hooks/useExpertMode';
import { formatApiError } from '../lib/api-errors';

export default function ToolsPage() {
  const { expert } = useExpertMode();
  const [dangerConfirm, setDangerConfirm] = useState<string | null>(null);
  const [dangerText, setDangerText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: quota } = useQuery({
    queryKey: ['quota-7d'],
    queryFn: () =>
      api<Array<{ date: string; used: number; limit: number }>>(
        '/admin/api/stats/quota?days=7',
      ),
  });

  const reconcile = useMutation({
    mutationFn: () =>
      api('/admin/api/matches/reconcile-live', { method: 'POST' }),
    onSuccess: () => setMsg('已触发 LIVE 修正'),
    onError: (e) => setErr(formatApiError(e)),
  });

  const syncPre = useMutation({
    mutationFn: () =>
      api('/admin/api/af/sync-pre-match', {
        method: 'POST',
        body: JSON.stringify({ lookaheadHours: 72, maxMatches: 20 }),
      }),
    onSuccess: () => setMsg('已触发近窗未开赛同步'),
    onError: (e) => setErr(formatApiError(e)),
  });

  return (
    <>
      <h2 style={{ marginTop: 0 }}>更多工具</h2>
      <p className="muted">
        只读工具与专家/危险区分离。写操作会记入审计日志。
        <HelpTip topic="apiQuota" />
      </p>
      {msg && <p className="muted">{msg}</p>}
      {err && <p className="status-err">{err}</p>}

      <article className="card">
        <h3 style={{ marginTop: 0 }}>只读</h3>
        <p className="muted">配额 7 日快照（需先有 snapshot 数据）</p>
        <ul className="muted">
          {(quota ?? []).map((q) => (
            <li key={q.date}>
              {q.date}: {q.used}/{q.limit}
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link to="/" className="btn secondary">
            驾驶舱配额
          </Link>
          <a className="btn secondary" href="/metrics" target="_blank" rel="noreferrer">
            Prometheus /metrics
          </a>
          <Link to="/ops/live-coverage" className="btn secondary">
            LIVE 覆盖
          </Link>
        </div>
      </article>

      <article className="card">
        <h3 style={{ marginTop: 0 }}>AF 档案（B2 / B4）</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <Link to="/catalog/leagues" className="btn secondary">
            联赛 B2
          </Link>
          <Link to="/catalog/teams" className="btn secondary">
            球队 B4
          </Link>
          <Link to="/catalog/players" className="btn secondary">
            球员 B4
          </Link>
        </div>
      </article>

      {expert && (
        <article className="card">
          <h3 style={{ marginTop: 0 }}>高级（专家）</h3>
          <p className="muted">批量操作会消耗 AF 配额。</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn secondary"
              disabled={reconcile.isPending}
              onClick={() => reconcile.mutate()}
            >
              reconcile-live
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={syncPre.isPending}
              onClick={() => syncPre.mutate()}
            >
              sync-pre-match（近窗）
            </button>
          </div>
        </article>
      )}

      {expert && (
        <article className="card" style={{ borderColor: '#c44' }}>
          <h3 style={{ marginTop: 0, color: '#c44' }}>危险区</h3>
          <p className="muted">输入「确认执行」后运行。</p>
          <button
            type="button"
            className="btn"
            onClick={() => setDangerConfirm('sync-pre-match-bulk')}
          >
            批量 sync-pre-match（max 30）
          </button>
        </article>
      )}

      <article className="card">
        <h3 style={{ marginTop: 0 }}>帮助</h3>
        <Link to="/help" className="btn secondary">
          值班清单
        </Link>
      </article>

      <ConfirmModal
        open={dangerConfirm != null}
        title="危险操作确认"
        onConfirm={() => {
          if (dangerText !== '确认执行') {
            setErr('请输入「确认执行」');
            return;
          }
          syncPre.mutate();
          setDangerConfirm(null);
          setDangerText('');
        }}
        onCancel={() => {
          setDangerConfirm(null);
          setDangerText('');
        }}
        pending={syncPre.isPending}
      >
        <p>将触发近窗未开赛批量同步。</p>
        <input
          placeholder="输入：确认执行"
          value={dangerText}
          onChange={(e) => setDangerText(e.target.value)}
          style={{ width: '100%' }}
        />
      </ConfirmModal>
    </>
  );
}
