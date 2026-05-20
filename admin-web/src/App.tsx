import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getToken, clearToken } from './api';
import CockpitPage from './pages/CockpitPage';
import BootstrapPage from './pages/BootstrapPage';
import DailyOpsPage from './pages/DailyOpsPage';
import JobsPage from './pages/Jobs';
import JobDetailPage from './pages/JobDetail';
import LoginPage from './pages/Login';
import MatchesPage from './pages/Matches';
import MatchDetailPage from './pages/MatchDetail';
import AiReportsPage from './pages/AiReports';
import UsersOrdersPage from './pages/UsersOrdersPage';
import ToolsPage from './pages/ToolsPage';
import AuditLogsPage from './pages/AuditLogsPage';
import HelpCenterPage from './pages/HelpCenterPage';
import LiveCoveragePage from './pages/LiveCoveragePage';
import LeagueCatalogPage from './pages/catalog/LeagueCatalogPage';
import TeamsCatalogPage from './pages/catalog/TeamsCatalogPage';
import PlayersCatalogPage from './pages/catalog/PlayersCatalogPage';
import WorldCupLayout from './pages/world-cup/WorldCupLayout';
import WorldCupOverviewPage from './pages/world-cup/WorldCupOverviewPage';
import WorldCupBootstrapPage from './pages/world-cup/WorldCupBootstrapPage';
import WorldCupMatchesPage from './pages/world-cup/WorldCupMatchesPage';
import WorldCupTeamsPage from './pages/world-cup/WorldCupTeamsPage';
import WorldCupLeaderboardsPage from './pages/world-cup/WorldCupLeaderboardsPage';
import WorldCupIntelPage from './pages/world-cup/WorldCupIntelPage';
import LocalizationPage from './pages/localization/LocalizationPage';
import { useExpertMode } from './hooks/useExpertMode';

function Shell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const { expert, toggle } = useExpertMode();
  const nav = (to: string, label: string) => (
    <Link to={to} className={loc.pathname === to || loc.pathname.startsWith(`${to}/`) ? 'active' : ''}>
      {label}
    </Link>
  );
  return (
    <div className="layout">
      <aside className="nav">
        <h1>运维后台</h1>
        {nav('/', '运营驾驶舱')}
        {nav('/world-cup', '世界杯 2026')}
        {nav('/bootstrap', '首次装数据')}
        {nav('/ops/daily/morning', '日常运维')}
        {nav('/matches', '比赛中心')}
        {nav('/jobs', '任务中心')}
        {nav('/ai-reports', 'AI 审核发布')}
        {nav('/localization', '中文本地化')}
        {nav('/users-orders', '用户与订单')}
        {nav('/audit-logs', '操作日志')}
        {nav('/tools', '更多工具')}
        <p className="muted" style={{ margin: '1rem 0 0.25rem', fontSize: '0.75rem' }}>
          AF 档案
        </p>
        {nav('/catalog/leagues', '联赛 B2')}
        {nav('/catalog/teams', '球队 B4')}
        {nav('/catalog/players', '球员 B4')}
        <button
          type="button"
          className="btn secondary expert-toggle"
          style={{ width: '100%' }}
          onClick={toggle}
        >
          专家模式：{expert ? '开' : '关'}
        </button>
        <button
          type="button"
          className="btn secondary"
          style={{ marginTop: '0.5rem', width: '100%' }}
          onClick={() => {
            clearToken();
            window.location.href = '/admin/login';
          }}
        >
          退出
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <CockpitPage />
          </RequireAuth>
        }
      />
      <Route path="/import" element={<Navigate to="/bootstrap" replace />} />
      <Route path="/ingest" element={<Navigate to="/bootstrap" replace />} />
      <Route
        path="/world-cup"
        element={
          <RequireAuth>
            <WorldCupLayout />
          </RequireAuth>
        }
      >
        <Route index element={<WorldCupOverviewPage />} />
        <Route path="bootstrap" element={<WorldCupBootstrapPage />} />
        <Route path="matches" element={<WorldCupMatchesPage />} />
        <Route path="teams" element={<WorldCupTeamsPage />} />
        <Route path="leaderboards" element={<WorldCupLeaderboardsPage />} />
        <Route path="intel" element={<WorldCupIntelPage />} />
      </Route>
      <Route
        path="/bootstrap"
        element={
          <RequireAuth>
            <BootstrapPage />
          </RequireAuth>
        }
      />
      <Route path="/ops/daily" element={<Navigate to="/ops/daily/morning" replace />} />
      <Route
        path="/ops/live-coverage"
        element={
          <RequireAuth>
            <LiveCoveragePage />
          </RequireAuth>
        }
      />
      <Route
        path="/ops/daily/:tab"
        element={
          <RequireAuth>
            <DailyOpsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/jobs"
        element={
          <RequireAuth>
            <JobsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/jobs/:jobId"
        element={
          <RequireAuth>
            <JobDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/matches"
        element={
          <RequireAuth>
            <MatchesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/matches/:matchId"
        element={
          <RequireAuth>
            <MatchDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/ai-reports"
        element={
          <RequireAuth>
            <AiReportsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/localization"
        element={
          <RequireAuth>
            <LocalizationPage />
          </RequireAuth>
        }
      />
      <Route
        path="/users-orders"
        element={
          <RequireAuth>
            <UsersOrdersPage />
          </RequireAuth>
        }
      />
      <Route
        path="/audit-logs"
        element={
          <RequireAuth>
            <AuditLogsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/tools"
        element={
          <RequireAuth>
            <ToolsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/help"
        element={
          <RequireAuth>
            <HelpCenterPage />
          </RequireAuth>
        }
      />
      <Route
        path="/catalog/leagues"
        element={
          <RequireAuth>
            <LeagueCatalogPage />
          </RequireAuth>
        }
      />
      <Route
        path="/catalog/teams"
        element={
          <RequireAuth>
            <TeamsCatalogPage />
          </RequireAuth>
        }
      />
      <Route
        path="/catalog/players"
        element={
          <RequireAuth>
            <PlayersCatalogPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
