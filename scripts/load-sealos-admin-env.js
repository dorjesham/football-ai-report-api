'use strict';

/**
 * 在 node 主程序前 -r 本脚本：从 deploy/sealos-admin-login.env 注入
 * - 一般键：仅当进程环境变量为 undefined 或 '' 时写入（不覆盖已配置值）。
 * - CORS 相关键：若平台误配为 *、空串或仅逗号（解析后无源），也允许用文件中的值覆盖，
 *   避免 Sealos 模板默认 CORS_ORIGIN=* 导致生产启动失败。
 */
const fs = require('fs');
const path = require('path');

const CORS_ENV_KEYS = new Set([
  'CORS_ORIGIN',
  'APP_PUBLIC_ORIGIN',
  'PUBLIC_ORIGIN',
  'FRONTEND_ORIGIN',
  'WEB_ORIGIN',
]);

function isInvalidCorsAllowlist(v) {
  if (v === undefined || v === null) return true;
  const t = String(v).trim();
  if (t === '' || t === '*') return true;
  const parts = t
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length === 0;
}

const file = path.join(__dirname, '..', 'deploy', 'sealos-admin-login.env');
if (!fs.existsSync(file)) return;

const raw = fs.readFileSync(file, 'utf8');
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 1) continue;
  const key = t.slice(0, i).trim();
  let val = t.slice(i + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  const cur = process.env[key];
  let inject = cur === undefined || cur === '';
  if (!inject && CORS_ENV_KEYS.has(key) && isInvalidCorsAllowlist(cur)) {
    inject = true;
  }
  if (inject) {
    process.env[key] = val;
  }
}
