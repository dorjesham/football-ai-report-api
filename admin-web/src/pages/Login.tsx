import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api';

export default function LoginPage() {
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState('admin@local.dev');
  const [password, setPassword] = useState('admin123456');
  const [err, setErr] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await login(identifier, password);
      nav('/');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h2 style={{ marginTop: 0 }}>运维后台登录</h2>
        <p className="muted">使用种子管理员账号（见 prisma seed 环境变量）</p>
        <label className="muted">账号</label>
        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        <label className="muted" style={{ marginTop: '0.75rem', display: 'block' }}>
          密码
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
        <button type="submit" className="btn" style={{ marginTop: '1rem', width: '100%' }}>
          登录
        </button>
      </form>
    </div>
  );
}
