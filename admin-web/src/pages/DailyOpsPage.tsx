import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import ActionCard from '../components/ActionCard';
import ConfirmModal from '../components/ConfirmModal';
import HelpTip from '../components/HelpTip';
import { useRunBundle } from '../hooks/useRunBundle';
import { bundleLabel } from '../lib/labels';

type Tab = 'morning' | 'matchday' | 'postmatch' | 'troubleshoot';

type DailySummary = {
  tab: string;
  lines: string[];
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'morning', label: '每天早晨' },
  { id: 'matchday', label: '比赛日' },
  { id: 'postmatch', label: '赛后补数据' },
  { id: 'troubleshoot', label: '故障向导' },
];

const TROUBLESHOOT = [
  {
    symptom: '用户说详情页空',
    cause: 'AF Raw 未同步或 coverage 缺失',
    first: '比赛工作台 → 拉取本场全部数据',
    next: '/matches',
  },
  {
    symptom: '用户看不到 AI',
    cause: '报告未 PUBLISHED',
    first: 'AI 审核发布 → 检查并发布',
    next: '/ai-reports',
  },
  {
    symptom: '比分不更新',
    cause: 'LIVE 未同步',
    first: '比赛日 → 同步赛中数据',
    next: '/ops/daily/matchday',
  },
  {
    symptom: '按钮返回 410',
    cause: '旧管线已废弃',
    first: '改用 sync-full / 新 bundle',
    next: '/matches',
  },
];

export default function DailyOpsPage() {
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const tab = (TABS.some((t) => t.id === tabParam) ? tabParam : 'morning') as Tab;
  const runBundle = useRunBundle();

  const { data: summary } = useQuery({
    queryKey: ['daily-summary', tab],
    queryFn: () =>
      api<DailySummary>(`/admin/api/ops/daily-summary?tab=${tab}`),
    enabled: tab !== 'troubleshoot',
    retry: false,
  });

  return (
    <>
      <h2 style={{ marginTop: 0 }}>日常运维</h2>
      <p className="muted">
        按值班场景执行清单。批量操作均创建任务记录。
        <HelpTip topic="partialSuccess" />
      </p>

      <nav className="tabs">
        {TABS.map((t) => (
          <Link
            key={t.id}
            to={`/ops/daily/${t.id}`}
            className={tab === t.id ? 'active' : ''}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {summary && summary.lines.length > 0 && (
        <article className="card">
          <h3 style={{ marginTop: 0 }}>今日摘要</h3>
          <ul className="muted">
            {summary.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </article>
      )}

      {tab === 'morning' && (
        <>
          <article className="card">
            <h3 style={{ marginTop: 0 }}>早晨清单</h3>
            <ul className="muted">
              <li>
                <Link to="/">驾驶舱待办与配额</Link>
              </li>
              <li>
                <Link to={todayMatchesHref()}>今日开球场次</Link>
              </li>
              <li>补未开赛 bundle（下方）</li>
              <li>
                <Link to="/ai-reports">待发布 AI</Link>
              </li>
            </ul>
          </article>
          <ActionCard
            title="补未来几天未开赛数据"
            description="对未来 SCHEDULED 场次补 AF Raw、赔率与 AI 草稿。"
            costHint="长任务，消耗 AF 配额。"
            afterHint="任务中心查看进度"
            actionLabel="运行：补未开赛"
            pending={runBundle.isPending}
            onAction={() =>
              runBundle.requestRun(
                'scheduled_pre_match_bootstrap',
                { lookaheadDays: 10, batchSize: 20, maxRounds: 50 },
                { title: '确认：补未开赛' },
              )
            }
            secondary={
              <Link to="/" className="btn secondary">
                查看驾驶舱
              </Link>
            }
          />
          <ActionCard
            title="检查待发布 AI"
            description="审核 DRAFT/REVIEW 报告后发布，C 端才可见。"
            actionLabel="去 AI 审核发布"
            onAction={() => navigate('/ai-reports')}
            variant="secondary"
          />
        </>
      )}

      {tab === 'matchday' && (
        <>
          <article className="card">
            <h3 style={{ marginTop: 0 }}>比赛日清单</h3>
            <ul className="muted">
              <li>
                <Link to="/ops/live-coverage">LIVE 数据覆盖页</Link>
              </li>
              <li>同步赛中 / 修正假 LIVE（下方）</li>
              <li>
                <Link to="/matches?status=LIVE">LIVE 比赛列表</Link>
              </li>
            </ul>
          </article>
          <ActionCard
            title="同步进行中比赛赛中数据"
            description="对 LIVE 场次拉取 events/statistics 与球员统计。"
            costHint="约数分钟，视 LIVE 场次数而定。"
            afterHint="任务中心或 LIVE coverage 查看"
            actionLabel="同步赛中数据"
            pending={runBundle.isPending}
            onAction={() =>
              runBundle.requestRun('live_match_enrich', {}, {
                title: '确认：赛中数据同步',
              })
            }
          />
          <ActionCard
            title="刷新比分并修正假 LIVE"
            description="近窗 AF 轮询 + 状态对账。"
            actionLabel="刷新并修正"
            pending={runBundle.isPending}
            onAction={() =>
              runBundle.requestRun('live_bootstrap', {}, {
                title: '确认：live_bootstrap',
              })
            }
            variant="secondary"
          />
          <ActionCard
            title="查看 LIVE 比赛"
            description="检查进行中场次数据健康度。"
            actionLabel="打开比赛列表"
            onAction={() => navigate('/matches?status=LIVE')}
            variant="secondary"
          />
        </>
      )}

      {tab === 'postmatch' && (
        <>
          <article className="card">
            <h3 style={{ marginTop: 0 }}>赛后清单</h3>
            <ul className="muted">
              <li>补已结束 bundle</li>
              <li>审核赛后 AI</li>
              <li>
                <Link to="/matches">抽查 1 场用户页面</Link>
              </li>
            </ul>
          </article>
          <ActionCard
            title="补最近已结束比赛详情"
            description="补 facts、预测、赛后短评等。"
            costHint="长任务。"
            afterHint="任务中心"
            actionLabel="补已结束"
            pending={runBundle.isPending}
            onAction={() =>
              runBundle.requestRun(
                'finished_post_match_bootstrap',
                { lookbackDays: 90, batchSize: 40, maxRounds: 20 },
                { title: '确认：补已结束' },
              )
            }
          />
          <ActionCard
            title="审核赛后 AI"
            description="发布后用户才能在详情页看到。"
            actionLabel="去 AI 审核发布"
            onAction={() => navigate('/ai-reports')}
            variant="secondary"
          />
        </>
      )}

      {tab === 'troubleshoot' && (
        <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
          {TROUBLESHOOT.map((row) => (
            <article key={row.symptom} className="card">
              <h3 style={{ marginTop: 0 }}>{row.symptom}</h3>
              <p className="muted">可能原因：{row.cause}</p>
              <p>第一步：{row.first}</p>
              <Link to={row.next} className="btn secondary">
                前往处理
              </Link>
            </article>
          ))}
        </div>
      )}

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
          <p className="muted">{bundleLabel(runBundle.confirm.bundleId)}</p>
        )}
      </ConfirmModal>
    </>
  );
}

function todayMatchesHref() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return `/matches?kickoffFrom=${start.toISOString()}&kickoffTo=${end.toISOString()}`;
}
