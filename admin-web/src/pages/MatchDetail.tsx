import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../api';
import AfCoverageModal from '../components/AfCoverageModal';
import JsonPreviewModal from '../components/JsonPreviewModal';
import { useExpertMode } from '../hooks/useExpertMode';
import ActionCard from '../components/ActionCard';
import ConfirmModal from '../components/ConfirmModal';
import HelpTip from '../components/HelpTip';
import { useRunBundle } from '../hooks/useRunBundle';
import {
  coverageKeyLabel,
  coverageStatusClass,
  reportStatusLabel,
} from '../lib/labels';
import { formatApiError } from '../lib/api-errors';

type CoverageRow = {
  status: string;
  fetchedAt?: string | null;
  lastError?: string | null;
};

type OpsStatus = {
  match: {
    id: string;
    status: string;
    kickoffTime: string;
    externalId: string | null;
    homeTeam: { nameCn: string };
    awayTeam: { nameCn: string };
    competition: { code: string | null } | null;
  };
  afBundle: {
    syncedAt: string | null;
    coverage: Record<string, CoverageRow | string>;
  };
  aiDataSignals?: {
    predictionsPresent: boolean;
    afComparisonPresent: boolean;
  };
  aiReports: {
    preMatch: {
      published?: { id: string; status?: string } | null;
      draft?: { id: string; status?: string } | null;
    };
    postMatch: {
      published?: { id: string; status?: string } | null;
      draft?: { id: string; status?: string } | null;
    };
  };
  recommendedActions: string[];
  ingest: {
    recentJobItems: {
      id: string;
      status: string;
      job: { id: string; bundleId: string | null };
    }[];
  };
};

export default function MatchDetailPage() {
  const { matchId = '' } = useParams();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSync, setConfirmSync] = useState(false);
  const [previewView, setPreviewView] = useState<string | null>(null);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const { expert } = useExpertMode();
  const runBundle = useRunBundle();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ops-status', matchId],
    queryFn: () => api<OpsStatus>(`/admin/api/matches/${matchId}/ops-status`),
    enabled: Boolean(matchId),
  });

  const syncFull = useMutation({
    mutationFn: () =>
      api(`/admin/api/af/matches/${matchId}/sync-full`, {
        method: 'POST',
        body: JSON.stringify({ force: true }),
      }),
    onSuccess: () => {
      setMessage('本场全部数据已同步完成');
      setConfirmSync(false);
      refetch();
      qc.invalidateQueries({ queryKey: ['af-coverage', matchId] });
    },
    onError: (err) => setError(formatApiError(err)),
  });

  const rebuildDetail = useMutation({
    mutationFn: () =>
      api(`/admin/api/matches/${matchId}/rebuild-detail`, { method: 'POST' }),
    onSuccess: () => setMessage('详情缓存已重建'),
    onError: (err) => setError(formatApiError(err)),
  });

  const regenerateAi = useMutation({
    mutationFn: () =>
      api<{ reused?: boolean }>(`/admin/api/ai/matches/${matchId}/regenerate`, {
        method: 'POST',
        body: JSON.stringify({ reportType: 'PRE_MATCH' }),
      }),
    onSuccess: (res) => {
      setConfirmRegenerate(false);
      setMessage(
        res?.reused ? '已覆盖同输入指纹的赛前草稿' : '已生成新的赛前 AI 草稿',
      );
      refetch();
      qc.invalidateQueries({ queryKey: ['ai-reports'] });
    },
    onError: (err) => setError(formatApiError(err)),
  });

  const syncLive = useMutation({
    mutationFn: () =>
      api(`/admin/api/matches/${matchId}/sync-live-facts`, { method: 'POST' }),
    onSuccess: () => setMessage('赛中数据同步已触发'),
    onError: (err) => setError(formatApiError(err)),
  });

  if (!matchId) return <p>缺少 matchId</p>;
  if (isLoading) return <p>加载中…</p>;
  if (!data) return <p>未找到比赛</p>;

  const m = data.match;
  const cov = data.afBundle.coverage;

  const renderCoverage = () => {
    return Object.entries(cov).map(([key, val]) => {
      const status =
        typeof val === 'object' && val !== null && 'status' in val
          ? String((val as CoverageRow).status)
          : String(val);
      const cls = coverageStatusClass(status);
      return (
        <div key={key} className={`coverage-chip ${cls}`}>
          {coverageKeyLabel(key)}: {status}
        </div>
      );
    });
  };

  return (
    <>
      <p>
        <Link to="/matches">← 比赛列表</Link>
      </p>
      <h2 style={{ marginTop: '0.5rem' }}>
        {m.homeTeam.nameCn} vs {m.awayTeam.nameCn}
      </h2>
      <p className="muted">
        {m.competition?.code} · {m.status} · {new Date(m.kickoffTime).toLocaleString()}
      </p>
      {message && <p className="muted">{message}</p>}
      {error && <p className="status-err">{error}</p>}

      {data.recommendedActions.includes('sync-full') && (
        <ActionCard
          title="拉取本场比赛全部数据"
          description="让用户打开详情页时能看到赔率、阵容、伤停等。"
          costHint="约 1～3 分钟；约 10～20 次 AF 调用（视缺失字段而定）。"
          afterHint="在下方用户预览或 coverage 查看效果"
          actionLabel="开始同步"
          pending={syncFull.isPending}
          onAction={() => setConfirmSync(true)}
        />
      )}

      {data.recommendedActions.includes('sync-live-facts') && (
        <ActionCard
          title="同步赛中数据"
          description="拉取 events、statistics 等 LIVE 数据。"
          actionLabel="同步赛中"
          pending={syncLive.isPending}
          onAction={() => syncLive.mutate()}
          variant="secondary"
        />
      )}

      {data.recommendedActions.includes('finished_post_match_bootstrap') && (
        <ActionCard
          title="提交赛后补全任务"
          description="批量管线中单场赛后补全（推荐在任务中心看重试）。"
          actionLabel="提交任务"
          pending={runBundle.isPending}
          onAction={() =>
            runBundle.requestRun(
              'finished_post_match_bootstrap',
              { lookbackDays: 90, batchSize: 40 },
              { title: '确认提交赛后补全' },
            )
          }
          variant="secondary"
        />
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>
          数据健康 <HelpTip topic="coverage" />
        </h3>
        <p className="muted">syncedAt: {data.afBundle.syncedAt || '—'}</p>
        <div className="coverage-grid">{renderCoverage()}</div>
        <button
          type="button"
          className="btn secondary"
          style={{ marginTop: '0.75rem' }}
          onClick={() => setModalOpen(true)}
        >
          详细 coverage
        </button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>
          AI 状态 <HelpTip topic="published" />
        </h3>
        <p>
          赛前：{' '}
          {data.aiReports.preMatch.published
            ? reportStatusLabel('PUBLISHED')
            : data.aiReports.preMatch.draft
              ? reportStatusLabel(
                  data.aiReports.preMatch.draft.status ?? 'DRAFT',
                )
              : '未生成'}
        </p>
        <p>
          赛后：{' '}
          {data.aiReports.postMatch.published
            ? reportStatusLabel('PUBLISHED')
            : data.aiReports.postMatch.draft
              ? reportStatusLabel(
                  data.aiReports.postMatch.draft.status ?? 'DRAFT',
                )
              : '未生成'}
        </p>
        <p className="muted">
          AF 实力对比：{' '}
          {data.aiDataSignals?.afComparisonPresent ? '有' : '无'}
          {data.aiDataSignals?.predictionsPresent === false && '（需 sync-full 拉取 predictions）'}
          {data.aiDataSignals?.predictionsPresent &&
            !data.aiDataSignals?.afComparisonPresent &&
            '（predictions 已拉取但无 comparison 字段）'}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn secondary"
            disabled={regenerateAi.isPending}
            onClick={() => setConfirmRegenerate(true)}
          >
            重生成 AI 草稿
          </button>
          <Link className="btn secondary" to={`/ai-reports?matchId=${matchId}`}>
            AI 审核发布
          </Link>
          <Link className="btn secondary" to={`/ai-reports?matchId=${matchId}&tab=failed`}>
            失败/异常
          </Link>
        </div>
      </div>

      {expert && (
        <ActionCard
          title="重建详情缓存（专家）"
          description="清除 Redis match-detail-v2 并预热 BFF。"
          actionLabel="重建缓存"
          pending={rebuildDetail.isPending}
          onAction={() => setConfirmRebuild(true)}
          variant="secondary"
        />
      )}

      <article className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>用户视角预览</h3>
        <p className="muted">
          通过 BFF 模拟游客 / 未解锁 / 已解锁（已解锁优先取该场有 PaymentUnlock 的用户）。
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {(['guest', 'locked', 'unlocked'] as const).map((view) => (
            <button
              key={view}
              type="button"
              className="btn secondary"
              onClick={() => setPreviewView(view)}
            >
              {view === 'guest' ? '游客' : view === 'locked' ? '未解锁' : '已解锁'}
            </button>
          ))}
          <a
            className="btn secondary"
            href={`/api/v2/matches/${matchId}/detail`}
            target="_blank"
            rel="noreferrer"
          >
            C 端 detail
          </a>
        </div>
      </article>

      {data.ingest.recentJobItems.length > 0 && (
        <table className="card">
          <thead>
            <tr>
              <th>任务项</th>
              <th>状态</th>
              <th>Job</th>
            </tr>
          </thead>
          <tbody>
            {data.ingest.recentJobItems.map((item) => (
              <tr key={item.id}>
                <td>{item.id.slice(0, 8)}…</td>
                <td>{item.status}</td>
                <td>
                  <Link to={`/jobs/${item.job.id}`}>
                    {item.job.bundleId || item.job.id}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmModal
        open={confirmRegenerate}
        title="确认重生成赛前 AI 草稿"
        onConfirm={() => regenerateAi.mutate()}
        onCancel={() => setConfirmRegenerate(false)}
        pending={regenerateAi.isPending}
      >
        <p>
          将调用模型重新生成赛前报告，并覆盖同输入指纹（inputHash）的现有草稿。
          {data.aiReports.preMatch.published &&
            ' 当前已有已发布稿，重生成后该稿会回退为 DRAFT，C 端将暂时不可见，需重新发布。'}
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={confirmSync}
        title="确认拉取本场全部数据"
        onConfirm={() => syncFull.mutate()}
        onCancel={() => setConfirmSync(false)}
        pending={syncFull.isPending}
      >
        <p>将消耗 AF API 配额。完成后请检查下方数据健康与用户预览。</p>
      </ConfirmModal>

      <ConfirmModal
        open={Boolean(runBundle.confirm)}
        title={runBundle.confirm?.title ?? ''}
        onConfirm={runBundle.confirmRun}
        onCancel={runBundle.cancelRun}
        pending={runBundle.isPending}
      >
        <p>{runBundle.confirm?.message}</p>
      </ConfirmModal>

      {modalOpen && (
        <AfCoverageModal
          matchId={matchId}
          tab="coverage"
          onClose={() => setModalOpen(false)}
        />
      )}

      {previewView && (
        <JsonPreviewModal
          title={`用户预览 · ${previewView}`}
          url={`/admin/api/matches/${matchId}/user-preview?view=${previewView}`}
          onClose={() => setPreviewView(null)}
        />
      )}

      <ConfirmModal
        open={confirmRebuild}
        title="确认重建详情缓存"
        onConfirm={() => {
          rebuildDetail.mutate();
          setConfirmRebuild(false);
        }}
        onCancel={() => setConfirmRebuild(false)}
        pending={rebuildDetail.isPending}
      >
        <p>将删除该场所有 tier 的 BFF 缓存并尝试预热。</p>
      </ConfirmModal>
    </>
  );
}
