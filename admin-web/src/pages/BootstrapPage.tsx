import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../api';
import ActionCard from '../components/ActionCard';
import ConfirmModal from '../components/ConfirmModal';
import HelpTip from '../components/HelpTip';
import { useRunBundle } from '../hooks/useRunBundle';
import { useExpertMode } from '../hooks/useExpertMode';
import { bundleLabel } from '../lib/labels';

type BootstrapStatus = {
  bootstrapStatus: string;
  lastFullInitial?: { jobId?: string; finishedAt: string } | null;
  steps: Array<{
    key: string;
    status: string;
    jobId?: string;
    finishedAt?: string;
  }>;
};

type OverviewEnv = {
  env: {
    hasApiFootballKey: boolean;
    hasDeepseekKey: boolean;
    nodeEnv?: string;
  };
};

const STEP_META = [
  {
    key: 'seed',
    title: '检查环境',
    description: '确认数据库、AF API Key、AI Key 已配置。',
    bundleId: null as string | null,
  },
  {
    key: 'catalog',
    title: '初始化基础目录',
    description: '校验 Tournament / Competition / Season 种子是否就绪。',
    bundleId: 'catalog',
  },
  {
    key: 'full_initial',
    title: '导入赛程和基础比赛',
    description: '目录 → 赛程 → 名单 → 积分榜 → 完赛 facts → 比分修正。',
    bundleId: 'full_initial',
    costHint: '预计 10～30 分钟，会消耗较多 AF API 配额。',
    afterHint: '可在比赛中心看到场次列表',
    body: { season: 2025, wcSeason: 2026 },
  },
  {
    key: 'pre_match',
    title: '补未开赛数据',
    description: '对未来 10 天内 SCHEDULED 场次补 AF Raw、赔率与 AI 草稿（不自动发布）。',
    bundleId: 'scheduled_pre_match_bootstrap',
    costHint: '长任务，请到任务中心查看进度。',
    afterHint: '任务中心查看每场明细',
    body: { lookaheadDays: 10, batchSize: 20, maxRounds: 50, skipAiReport: false },
  },
  {
    key: 'finished',
    title: '补已结束数据并抽查',
    description: '为已结束比赛补 facts、预测锁定、赛后短评等。',
    bundleId: 'finished_post_match_bootstrap',
    costHint: '长任务，消耗 AF 配额。',
    afterHint: '打开 C 端比赛详情抽查',
    body: { lookbackDays: 90, batchSize: 40, maxRounds: 20 },
  },
];

function stepStatusLabel(s: string) {
  const m: Record<string, string> = {
    NOT_STARTED: '未开始',
    RUNNING: '进行中',
    SUCCESS: '完成',
    PARTIAL_SUCCESS: '部分成功',
    FAILED: '失败',
    NEEDS_REPAIR: '需修复',
  };
  return m[s] ?? s;
}

export default function BootstrapPage() {
  const [season, setSeason] = useState(2025);
  const runBundle = useRunBundle();
  const { expert } = useExpertMode();

  const { data: bootstrap } = useQuery({
    queryKey: ['bootstrap-status'],
    queryFn: () => api<BootstrapStatus>('/admin/api/ops/bootstrap-status'),
    retry: false,
  });

  const { data: overview } = useQuery({
    queryKey: ['overview'],
    queryFn: () => api<OverviewEnv>('/admin/api/overview'),
  });

  const completed = bootstrap?.bootstrapStatus === 'COMPLETED';

  if (completed) {
    return (
      <>
        <h2 style={{ marginTop: 0 }}>首次装数据</h2>
        <article className="card">
          <p>
            <strong>已完成初始化</strong>
            <HelpTip topic="bundle" />
          </p>
          <p className="muted">状态：{bootstrap?.bootstrapStatus}</p>
          {bootstrap?.lastFullInitial?.finishedAt && (
            <p className="muted">
              最近 full_initial 完成：{' '}
              {new Date(bootstrap.lastFullInitial.finishedAt).toLocaleString()}
              {bootstrap.lastFullInitial.jobId && (
                <>
                  {' '}
                  <Link to={`/jobs/${bootstrap.lastFullInitial.jobId}`}>任务</Link>
                </>
              )}
            </p>
          )}
          <Link to="/jobs" className="btn secondary">
            查看历史任务
          </Link>
          {expert && (
            <button
              type="button"
              className="btn"
              style={{ marginLeft: '0.5rem' }}
              onClick={() =>
                runBundle.requestRun(
                  'full_initial',
                  { season: 2025, wcSeason: 2026 },
                  {
                    title: '专家：重跑 full_initial',
                    message: '将再次消耗大量 AF 配额，确认继续？',
                  },
                )
              }
            >
              专家：重跑 full_initial
            </button>
          )}
        </article>
      </>
    );
  }

  return (
    <>
      <h2 style={{ marginTop: 0 }}>首次装数据</h2>
      <p className="muted">
        新库/空库按顺序执行以下步骤。每步会创建可追踪的后台任务。
        <HelpTip topic="bundle" />
      </p>

      {bootstrap?.steps && (
        <ul className="card" style={{ listStyle: 'none', padding: '0.75rem 1rem' }}>
          {bootstrap.steps.map((s) => (
            <li key={s.key} style={{ marginBottom: '0.35rem' }}>
              {STEP_META.find((m) => m.key === s.key)?.title ?? s.key}：{' '}
              <strong>{stepStatusLabel(s.status)}</strong>
              {s.jobId && (
                <>
                  {' '}
                  <Link to={`/jobs/${s.jobId}`}>查看任务</Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <ActionCard
        title="Step 1：检查环境"
        description="确认 API Key 与运行环境正常后再执行灌数。"
        costHint={
          overview
            ? `AF Key: ${overview.env.hasApiFootballKey ? '已配置' : '缺失'} · AI: ${
                overview.env.hasDeepseekKey ? '已配置' : '缺失'
              } · 环境: ${overview.env.nodeEnv ?? '—'}`
            : '加载中…'
        }
        afterHint="环境正常后继续 Step 2"
        actionLabel="刷新检查"
        onAction={() => window.location.reload()}
        variant="secondary"
      />

      <ActionCard
        title="Step 2：初始化基础目录"
        description={STEP_META[1].description}
        costHint="约 1 分钟，几乎不消耗 AF 配额。"
        afterHint="目录校验通过"
        actionLabel="开始校验目录"
        pending={runBundle.isPending}
        onAction={() =>
          runBundle.requestRun('catalog', {}, {
            title: '运行：校验目录',
            message: '将检查种子目录是否完整。',
          })
        }
      />

      <div className="card" style={{ marginBottom: '1rem' }}>
        <label className="muted">赛季年份（full_initial 用）</label>
        <input type="number" value={season} onChange={(e) => setSeason(Number(e.target.value))} />
      </div>

      <ActionCard
        title="Step 3：导入赛程和基础比赛"
        description={STEP_META[2].description}
        costHint={STEP_META[2].costHint}
        afterHint={STEP_META[2].afterHint}
        actionLabel="开始一键初始入库"
        pending={runBundle.isPending}
        onAction={() =>
          runBundle.requestRun(
            'full_initial',
            { season, wcSeason: 2026 },
            {
              title: '运行：一键初始入库',
              message: '将拉取赛程、名单、积分榜等，耗时较长。',
            },
          )
        }
      />

      <ActionCard
        title="Step 4：补未开赛数据"
        description={STEP_META[3].description}
        costHint={STEP_META[3].costHint}
        afterHint={STEP_META[3].afterHint}
        actionLabel="开始补未开赛"
        pending={runBundle.isPending}
        onAction={() =>
          runBundle.requestRun('scheduled_pre_match_bootstrap', STEP_META[3].body!, {
            title: '运行：补未开赛详情',
          })
        }
      />

      <ActionCard
        title="Step 5：补已结束数据"
        description={STEP_META[4].description}
        costHint={STEP_META[4].costHint}
        afterHint={STEP_META[4].afterHint}
        actionLabel="开始补已结束"
        pending={runBundle.isPending}
        onAction={() =>
          runBundle.requestRun('finished_post_match_bootstrap', STEP_META[4].body!, {
            title: '运行：补已结束详情',
          })
        }
        secondary={
          <Link to="/matches" className="btn secondary">
            去比赛中心抽查
          </Link>
        }
      />

      {runBundle.error && <p className="status-err">{runBundle.error}</p>}

      <ConfirmModal
        open={Boolean(runBundle.confirm)}
        title={runBundle.confirm?.title ?? ''}
        onConfirm={runBundle.confirmRun}
        onCancel={runBundle.cancelRun}
        pending={runBundle.isPending}
      >
        <p>{runBundle.confirm?.message}</p>
        {runBundle.confirm && (
          <p className="muted">
            Bundle: {bundleLabel(runBundle.confirm.bundleId)}
          </p>
        )}
      </ConfirmModal>
    </>
  );
}
