# GitHub Actions Secrets（示例）

勿将真实值提交到 Git。在仓库 **Settings → Secrets and variables → Actions** 配置。

## L1 / Release 必填

| Secret | 说明 |
|--------|------|
| `DATABASE_URL` | staging MySQL 连接串（`mysql://...`） |

未配置时：nightly 仅跑 L0，L1 job 跳过；**release 打 tag 会失败**（见 `ci-release.yml`）。

## 可选

| Secret / 变量 | 说明 |
|---------------|------|
| `API_ORIGIN` | staging API 根 URL（未来 HTTP 验收扩展） |
| `ADMIN_JWT` | Admin Bearer token（未来 Admin API 验收） |

## Workflow 内联 env（已在 yml 中设置）

| 变量 | 值 |
|------|-----|
| `CI_STRICT` | `1` |
| `CI_RELEASE` | 仅 release workflow：`1` |
| `NODE_ENV` | `development` |
| `JWT_SECRET` | ≥24 字符占位（满足非 production 校验） |

## 阈值（Repository variables 或 workflow env）

| 变量 | 默认 |
|------|------|
| `LIVE_SYNC_P95_MAX_MS` | `60000` |
| `REPORT_FACT_CHECK_MIN_PASS_RATE` | `0.95` |
| `PREDICTION_BACKTEST_MIN_GRADED` | `10` |
| `AF_COST_DAILY_MAX` | 未设则不因成本 fail |

## 本地跑 L1

```bash
export DATABASE_URL="mysql://..."
export CI_STRICT=1
export JWT_SECRET="local-dev-secret-at-least-24-chars"
npm run ci:l1
npm run ci:report
```

## Branch protection（L0）

`main` → Require status checks → **CI (L0)**（`ci-pr.yml` 的 `name`）。

## Sealos

镜像构建与部署仍在 Sealos；**不要**在 Sealos 流水线重复跑 L0/L1。
