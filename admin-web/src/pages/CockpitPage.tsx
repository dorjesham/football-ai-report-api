import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { api } from '../api';
import HelpTip from '../components/HelpTip';
import { bundleLabel, jobStatusLabel } from '../lib/labels';

const MANUAL_TODO_KEY = 'manual-spot-check-date';

type SystemStatusItem = { level: 'ok' | 'warning' | 'error'; label: string };

type Overview = {
  env: {
    hasApiFootballKey: boolean;
    hasDeepseekKey: boolean;
    nodeEnv?: string;
  };
  systemStatus?: {
    database: SystemStatusItem;
    redis: SystemStatusItem;
    afApi: SystemStatusItem;
    aiProvider: SystemStatusItem;
    environment: SystemStatusItem;
  };
  afQuota: { used: number; limit: number; remaining: number };
  cards: {
    totalUsers: number;
    todayNewUsers: number;
    todayKickoffMatches: number;
    liveMatches: number;
    pendingAiDrafts: number;
    todayRevenueCents: number;
  };
  todos: Array<{
    id: string;
    severity: string;
    title: string;
    description: string;
    actionLabel: string;
    actionRoute?: string;
    completionMode?: string;
  }>;
  matchHealth: { green: number; yellow: number; red: number };
  recentJobs: Array<{
    id: string;
    bundleId: string | null;
    kind: string;
    status: string;
    progressPct: number;
    startedAt: string;
  }>;
  recentIncidents: Array<{
    id: string;
    severity: string;
    title: string;
    route: string;
    createdAt: string;
  }>;
  charts?: {
    users7d: Array<{ date: string; count: number }>;
    orders7d: Array<{ date: string; count: number; revenueCents: number }>;
    quota7d?: Array<{ date: string; used: number; limit: number }>;
  };
};

function centsToYuan(cents: number) {
  return (cents / 100).toFixed(2);
}

function badgeClass(level: string) {
  if (level === 'error') return 'badge miss';
  if (level === 'warning') return 'badge warn';
  return 'badge ok';
}

function BarChart({ data, field }: { data: Array<Record<string, unknown>>; field: string }) {
  const max = Math.max(1, ...data.map((d) => Number(d[field] ?? 0)));
  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div
          key={String(d.date)}
          className="bar"
          style={{ height: `${(Number(d[field] ?? 0) / max) * 100}%` }}
          title={`${d.date}: ${d[field]}`}
        />
      ))}
    </div>
  );
}

function StackedHealth({ green, yellow, red }: { green: number; yellow: number; red: number }) {
  const total = Math.max(1, green + yellow + red);
  return (
    <div className="stacked-bar" style={{ display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${(green / total) * 100}%`, background: '#2a9d5c' }} title={`绿 ${green}`} />
      <div style={{ width: `${(yellow / total) * 100}%`, background: '#e9c46a' }} title={`黄 ${yellow}`} />
      <div style={{ width: `${(red / total) * 100}%`, background: '#e76f51' }} title={`红 ${red}`} />
    </div>
  );
}

export default function CockpitPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: () => api<Overview>('/admin/api/overview'),
    refetchInterval: 30_000,
  });

  const visibleTodos = useMemo(() => {
    if (!data?.todos) return [];
    const today = new Date().toISOString().slice(0, 10);
    const doneManual = localStorage.getItem(MANUAL_TODO_KEY) === today;
    return data.todos.filter(
      (t) => !(t.id === 'manual-spot-check' && t.completionMode === 'manual' && doneManual),
    );
  }, [data?.todos]);

  if (isLoading || !data) return <p>加载驾驶舱…</p>;

  const quotaPct =
    data.afQuota.limit > 0
      ? Math.round((data.afQuota.remaining / data.afQuota.limit) * 100)
      : 100;

  const sys = data.systemStatus;

  return (
    <>
      <h2 style={{ marginTop: 0 }}>运营驾驶舱</h2>

      <article className="card">
        <h3 style={{ marginTop: 0 }}>系统状态</h3>
        {sys ? (
          <p>
            {(
              [
                ['database', '数据库'],
                ['redis', 'Redis'],
                ['afApi', 'AF API'],
                ['aiProvider', 'AI'],
                ['environment', '环境'],
              ] as const
            ).map(([key, short]) => (
              <span key={key} className={badgeClass(sys[key].level)} style={{ marginRight: 6 }}>
                {short}: {sys[key].label}
              </span>
            ))}
          </p>
        ) : (
          <p>
            <span className={data.env.hasApiFootballKey ? 'badge ok' : 'badge miss'}>
              AF API {data.env.hasApiFootballKey ? '正常' : '凭证缺失'}
            </span>{' '}
            <span className={data.env.hasDeepseekKey ? 'badge ok' : 'badge warn'}>
              AI {data.env.hasDeepseekKey ? '正常' : 'Key 未配置'}
            </span>
          </p>
        )}
        <p className="muted">
          配额 {data.afQuota.remaining}/{data.afQuota.limit}（{quotaPct}% 剩余）
          <HelpTip topic="apiQuota" />
        </p>
        <div className="progress">
          <div style={{ width: `${quotaPct}%` }} />
        </div>
      </article>

      {visibleTodos.length > 0 && (
        <article className="card">
          <h3 style={{ marginTop: 0 }}>今日待办</h3>
          <ul className="todo-list">
            {visibleTodos.map((t) => (
              <li
                key={t.id}
                className={
                  t.severity === 'critical'
                    ? 'todo-severity-critical'
                    : t.severity === 'warning'
                      ? 'todo-severity-warning'
                      : undefined
                }
              >
                <div>
                  <strong>{t.title}</strong>
                  <p className="muted" style={{ margin: '0.2rem 0' }}>
                    {t.description}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {t.actionRoute && (
                    <Link to={t.actionRoute} className="btn secondary">
                      {t.actionLabel}
                    </Link>
                  )}
                  {t.id === 'manual-spot-check' && (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        localStorage.setItem(
                          MANUAL_TODO_KEY,
                          new Date().toISOString().slice(0, 10),
                        );
                        window.location.reload();
                      }}
                    >
                      今日已完成
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </article>
      )}

      <div className="grid" style={{ marginBottom: '1rem' }}>
        {[
          ['总用户', data.cards.totalUsers, '/users-orders'],
          ['今日新增', data.cards.todayNewUsers, '/users-orders'],
          ['今日开球', data.cards.todayKickoffMatches, todayMatchesLink()],
          ['LIVE', data.cards.liveMatches, '/ops/daily/matchday'],
          ['待审核 AI', data.cards.pendingAiDrafts, '/ai-reports'],
          ['今日收入 ¥', centsToYuan(data.cards.todayRevenueCents), '/users-orders'],
        ].map(([label, val, to]) => (
          <Link key={String(label)} to={String(to)} className="card stat" style={{ textDecoration: 'none' }}>
            <span>{val}</span>
            <small>{label}</small>
          </Link>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <article className="card">
          <h3 style={{ marginTop: 0 }}>
            比赛数据健康度 <HelpTip topic="coverage" />
          </h3>
          <StackedHealth {...data.matchHealth} />
          <p className="muted" style={{ marginTop: 8 }}>
            绿 {data.matchHealth.green} · 黄 {data.matchHealth.yellow} · 红 {data.matchHealth.red}
          </p>
        </article>
        {data.charts?.quota7d && data.charts.quota7d.length > 0 && (
          <article className="card">
            <h3 style={{ marginTop: 0 }}>近 7 日 API 配额消耗</h3>
            <BarChart data={data.charts.quota7d} field="used" />
          </article>
        )}
        {data.charts && (
          <>
            <article className="card">
              <h3 style={{ marginTop: 0 }}>近 7 日注册</h3>
              <BarChart data={data.charts.users7d} field="count" />
            </article>
            <article className="card">
              <h3 style={{ marginTop: 0 }}>近 7 日订单</h3>
              <BarChart data={data.charts.orders7d} field="count" />
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                悬停柱查看笔数；收入见订单页统计
              </p>
            </article>
          </>
        )}
      </div>

      <article className="card">
        <h3 style={{ marginTop: 0 }}>最近任务</h3>
        <ul className="muted">
          {data.recentJobs.slice(0, 5).map((j) => (
            <li key={j.id}>
              <Link to={`/jobs/${j.id}`}>
                {bundleLabel(j.bundleId, j.kind)} — {jobStatusLabel(j.status)} ({j.progressPct}%)
              </Link>
            </li>
          ))}
        </ul>
      </article>

      {data.recentIncidents?.length > 0 && (
        <article className="card">
          <h3 style={{ marginTop: 0 }}>最近异常</h3>
          <ul>
            {data.recentIncidents.map((i) => (
              <li key={i.id}>
                <Link to={i.route}>{i.title}</Link>
                <span className="muted"> · {new Date(i.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </article>
      )}

      <article className="card">
        <h3 style={{ marginTop: 0 }}>快捷入口</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <Link to="/bootstrap" className="btn">
            首次装数据
          </Link>
          <Link to="/ops/daily/morning" className="btn secondary">
            日常运维
          </Link>
          <Link to="/matches" className="btn secondary">
            比赛有问题
          </Link>
        </div>
      </article>
    </>
  );
}

function todayMatchesLink() {
  const d = new Date();
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return `/matches?kickoffFrom=${start.toISOString()}&kickoffTo=${end.toISOString()}`;
}
