import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { ORDER_STATUS_LABELS } from '../lib/labels';
import ConfirmModal from '../components/ConfirmModal';

type UserRow = {
  id: string;
  createdAt: string;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  role: string;
  favoriteCount: number;
  unlockCount: number;
  lastBrowseAt: string | null;
};

type OrderRow = {
  id: string;
  orderNo: string;
  amount: number;
  status: string;
  product: string;
  paidAt: string | null;
  createdAt: string;
  user: { id: string; nickname: string | null; phone: string | null };
  match: {
    id: string;
    homeTeam: { nameCn: string };
    awayTeam: { nameCn: string };
  } | null;
  unlocks: Array<{ id: string; status: string }>;
};

function orderStatusLabel(s: string) {
  return ORDER_STATUS_LABELS[s] ?? s;
}

export default function UsersOrdersPage() {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [revealPii, setRevealPii] = useState(false);

  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<UserRow[]>('/admin/api/users?take=50'),
  });

  const { data: orders } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => api<OrderRow[]>('/admin/api/orders?take=50'),
  });

  const { data: byProduct } = useQuery({
    queryKey: ['orders-by-product'],
    queryFn: () =>
      api<Array<{ product: string; count: number; revenueCents: number }>>(
        '/admin/api/stats/orders/by-product',
      ),
  });

  const { data: assets } = useQuery({
    queryKey: ['user-assets', selectedUser],
    queryFn: () =>
      api<Array<{ id: string; assetType: string; title: string | null; createdAt: string }>>(
        `/admin/api/users/${selectedUser}/assets`,
      ),
    enabled: Boolean(selectedUser),
  });

  const { data: userSummary } = useQuery({
    queryKey: ['user-summary', selectedUser, revealPii],
    queryFn: () =>
      api(`/admin/api/users/${selectedUser}/summary?revealPii=${revealPii}`),
    enabled: Boolean(selectedUser),
  });

  const totalUsers = users?.length ?? 0;
  const totalOrders = orders?.length ?? 0;

  return (
    <>
      <h2 style={{ marginTop: 0 }}>用户与订单</h2>

      <div className="grid" style={{ marginBottom: '1rem' }}>
        <article className="card stat">
          <span>{totalUsers}</span>
          <small>用户（本页）</small>
        </article>
        <article className="card stat">
          <span>{totalOrders}</span>
          <small>订单（本页）</small>
        </article>
        {(byProduct ?? []).map((p) => (
          <article key={p.product} className="card stat">
            <span>{p.count}</span>
            <small>
              {p.product} · ¥{(p.revenueCents / 100).toFixed(0)}
            </small>
          </article>
        ))}
      </div>

      <p>
        <a className="btn secondary" href="/admin/api/orders/export.csv">
          导出订单 CSV
        </a>
      </p>

      {totalUsers === 0 && (
        <article className="card">
          <p>
            <strong>暂无用户数据</strong>
          </p>
          <p className="muted">
            这是新库的正常状态。完成首次装数据后，用户访问前台才会产生行为数据。
          </p>
        </article>
      )}

      <h3>用户列表</h3>
      <table className="card">
        <thead>
          <tr>
            <th>注册</th>
            <th>昵称</th>
            <th>手机</th>
            <th>收藏</th>
            <th>解锁</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {(users || []).map((u) => (
            <tr key={u.id}>
              <td>{new Date(u.createdAt).toLocaleDateString()}</td>
              <td>{u.nickname || '—'}</td>
              <td>{u.phone || '—'}</td>
              <td>{u.favoriteCount}</td>
              <td>{u.unlockCount}</td>
              <td>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setSelectedUser(u.id);
                    setRevealPii(false);
                  }}
                >
                  详情
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>最近订单</h3>
      {totalOrders === 0 ? (
        <article className="card">
          <p className="muted">尚未产生订单，不影响灌数。</p>
        </article>
      ) : (
        <table className="card">
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>金额</th>
              <th>状态</th>
              <th>权益</th>
            </tr>
          </thead>
          <tbody>
            {(orders || []).map((o) => (
              <tr key={o.id}>
                <td>{new Date(o.createdAt).toLocaleString()}</td>
                <td>{o.user.nickname || o.user.id.slice(0, 8)}</td>
                <td>¥{(o.amount / 100).toFixed(2)}</td>
                <td>{orderStatusLabel(o.status)}</td>
                <td>
                  {o.status === 'PAID' && o.unlocks.length === 0
                    ? '未发放'
                    : o.unlocks.map((u) => orderStatusLabel(u.status)).join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmModal
        open={Boolean(selectedUser)}
        title="用户详情"
        confirmLabel="关闭"
        cancelLabel={revealPii ? '关闭' : '查看完整手机/邮箱'}
        onConfirm={() => {
          setSelectedUser(null);
          setRevealPii(false);
        }}
        onCancel={() => {
          if (!revealPii) setRevealPii(true);
          else {
            setSelectedUser(null);
            setRevealPii(false);
          }
        }}
      >
        {userSummary ? (
          <div style={{ fontSize: '0.85rem', maxHeight: 400, overflow: 'auto' }}>
            <section>
              <strong>基本</strong>
              <p>
                {(userSummary as { nickname?: string }).nickname} ·{' '}
                {(userSummary as { phone?: string }).phone} ·{' '}
                {(userSummary as { email?: string }).email}
              </p>
            </section>
            <section>
              <strong>付费</strong>
              <p>
                累计 ¥
                {(
                  ((userSummary as { totalPaidCents?: number }).totalPaidCents ?? 0) / 100
                ).toFixed(2)}
              </p>
            </section>
            <section>
              <strong>行为</strong>
              <p className="muted">
                收藏 {(userSummary as { counts?: { favoriteMatches: number } }).counts
                  ?.favoriteMatches ?? 0}{' '}
                · 浏览记录{' '}
                {((userSummary as { browseHistories?: unknown[] }).browseHistories ?? [])
                  .length}
              </p>
            </section>
            <section>
              <strong>生成记录</strong>
              {(assets ?? []).length === 0 ? (
                <p className="muted">无</p>
              ) : (
                <ul>
                  {assets!.map((a) => (
                    <li key={a.id}>
                      {a.assetType} {a.title ?? ''}{' '}
                      {new Date(a.createdAt).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <p>加载中…</p>
        )}
      </ConfirmModal>
    </>
  );
}
