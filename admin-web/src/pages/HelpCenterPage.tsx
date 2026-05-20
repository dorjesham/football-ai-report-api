import { Link } from 'react-router-dom';

export default function HelpCenterPage() {
  return (
    <>
      <h2 style={{ marginTop: 0 }}>值班清单</h2>
      <article className="card">
        <h3 style={{ marginTop: 0 }}>每天早晨</h3>
        <ol className="muted">
          <li>打开运营驾驶舱，查看系统状态与待办</li>
          <li>
            <Link to="/ops/daily/morning">日常运维 → 每天早晨</Link>：补未开赛
          </li>
          <li>检查 API 配额与待审核 AI</li>
        </ol>
      </article>
      <article className="card">
        <h3 style={{ marginTop: 0 }}>比赛日</h3>
        <ol className="muted">
          <li>
            <Link to="/ops/daily/matchday">同步赛中数据</Link>（live_match_enrich）
          </li>
          <li>查看 LIVE coverage，必要时 live_bootstrap</li>
        </ol>
      </article>
      <article className="card">
        <h3 style={{ marginTop: 0 }}>赛后</h3>
        <ol className="muted">
          <li>
            <Link to="/ops/daily/postmatch">补已结束</Link> + AI 审核发布
          </li>
        </ol>
      </article>
      <article className="card">
        <h3 style={{ marginTop: 0 }}>新库灌数</h3>
        <p className="muted">
          按 <Link to="/bootstrap">首次装数据</Link> 五步：环境 → catalog → full_initial →
          补未开赛 → 补已结束
        </p>
      </article>
    </>
  );
}
