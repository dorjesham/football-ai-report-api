import { Link, Outlet, useLocation } from 'react-router-dom';

const links = [
  ['', '总览'],
  ['bootstrap', '入库'],
  ['matches', '场次'],
  ['teams', '球队'],
  ['leaderboards', '积分榜/射手'],
  ['intel', '预测与 AI'],
] as const;

export default function WorldCupLayout() {
  const loc = useLocation();
  const base = '/world-cup';
  return (
    <div>
      <h2>世界杯 2026（AF 唯一数据源）</h2>
      <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {links.map(([path, label]) => {
          const to = path ? `${base}/${path}` : base;
          const active =
            loc.pathname === to ||
            (path !== '' && loc.pathname.startsWith(`${to}`));
          return (
            <Link
              key={path}
              to={to}
              className={active ? 'btn primary' : 'btn secondary'}
              style={{ textDecoration: 'none' }}
            >
              {label}
            </Link>
          );
        })}
        <Link to="/jobs" className="btn secondary">
          任务中心
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}
