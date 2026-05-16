# football-ai-report-api

NestJS + Prisma + MySQL 后端：足球赛前 AI 情报报告 API（详见根目录《开发文档.md》）。开发进度见《开发进度.md》。

## 本地 / Devbox 开发

1. 复制环境变量：`cp .env.example .env`，填写 `DATABASE_URL` 等（勿提交 `.env`）。
2. 安装依赖：`npm install`
3. 数据库：`npx prisma migrate dev`（或生产环境 `npx prisma migrate deploy`）
4. 种子数据：须**先 migrate 再 seed**（否则会出现 `column membershipUntil does not exist` 等）。推荐一次性执行 **`npm run db:setup`**（等价于 `migrate deploy` + `db seed`）；本地也可用 `npx prisma migrate dev` 后再 `npx prisma db seed`。
5. 启动：`npm run start:dev` 或 `bash entrypoint.sh`；生产形态：`npm run build` 后 `npm start`（即 `node dist/main.js`）。
   - **赛程/比分审计（可选）**：配置 `FOOTBALL_DATA_API_KEY` 后运行 **`npm run audit:schedule`**，或与后台 **赛程审计（FD）**（`/admin-view/schedule-audit`）对照本地赛程与 football-data；详见《第一期前端对接规范文档》§8。
   - **赛后历史入库**：管理员 JWT 调用 **`POST /admin/data-ingest/fd-finished`**（FD 已完赛回填 `Match`+`MatchFacts`）、**`POST /admin/data-ingest/fd-player-squads`**（FD 各队 squad → `Player`；**`Team.coachProfile`** 含教练与可选执教比赛 + 单场阵型摘录；可选球员 Person 增强）、**`POST /admin/data-ingest/openfootball/league`**（开源 football.json）、**`POST /admin/data-ingest/structure-raw`**（DeepSeek+Zod 结构化）；详见《开发文档》§二十八 Admin API 续节。
   - **库内比赛只读报表**：终端 **`npm run stats:match-report`**；或管理后台 **数据报表（按联赛）**；REST **`GET /admin/match-data-report`**（Admin JWT）。
6. **端口**：未设置 `PORT` / `HTTP_PORT` / `APP_PORT` 时，**`NODE_ENV=production`**（Docker 镜像、`entrypoint.sh` 生产）下默认 **8080**；否则（本地、`npm run start` 未设 `NODE_ENV`）默认 **3000**，避免与 Devbox 上已占用 **8080** 的进程冲突。任意环境都可在 `.env` 里显式写 **`PORT=...`** 覆盖。不要同时在同一端口上跑两个实例（会出现 `EADDRINUSE`）。
7. 健康检查（本地默认 3000）：[http://localhost:3000/health](http://localhost:3000/health)
8. Swagger（**非 production** 默认开启）：[http://localhost:3000/docs](http://localhost:3000/docs)。**production** 默认不挂载 `/docs`；需要时设置 **`ENABLE_SWAGGER_DOCS=true`**。
9. **管理后台（EJS）**：[http://localhost:3000/admin-view/login](http://localhost:3000/admin-view/login) 账号密码来自环境变量 **`ADMIN_VIEW_LOGIN_USERNAME`** / **`ADMIN_VIEW_LOGIN_PASSWORD`**。登录后进 **`/admin-view` 运维中心**：用大白话说明环境与**一键同步赛程 / 名单 / 近窗比分**等；侧栏「高级与排障」保留完整 **数据入库**、审计、元数据表等。`db seed` 的演示比赛开球时间相对当前时间，并非官网赛程；需 **`API_FOOTBALL_API_KEY`** 或 **`FOOTBALL_DATA_API_KEY`** 后按运维中心或单场页按钮同步。若按钮返回 **`Cannot POST … NotFoundException`**，请 **`npm run build` 并重启**。浏览器路径不是默认 `/admin-view` 时设 **`ADMIN_VIEW_PATH_PREFIX`**；登录表单与重定向已随此前缀。仓库内 **`deploy/sealos-admin-login.env`** 默认账号见上文；亦可展开「JWT」粘贴 Token。**比赛详情**优先展示「本页操作」；天气/预测全文等在「详细内容」折叠内。**数据入库**全选项仍为 **`/admin-view/data-ingest`**；**数据报表** **`/admin-view/data-report`**（与 `GET /admin/match-data-report` 同源，详见《第一期前端对接规范文档》§8）。

定时任务：设置 `ENABLE_CRON_SYNC=true` 后，按《开发文档》在固定时刻尝试同步赛程/积分榜与焦点战天气（需配置 `FOOTBALL_DATA_API_KEY`、`QWEATHER_API_KEY` 等，失败会写入 `ApiLog`）。**自动情报批量**：同开关下若设 **`AUTO_INTEL_CRON_MODE=prediction`** 或 **`full`**，Cron 每 **20 分钟**对时间窗内尚无 `MatchPrediction` 的场次批量补预测或跑 Phase C 管线（详见 `.env.example`）；管理后台 Dashboard 提供「立即执行一轮」表单，Admin API 为 **`POST /admin/auto-intel/run`**。

健康检查：`GET /health?db=1` 会检测数据库连通性。

开发环境可使用 `POST /auth/wechat-login`，body `{"code":"mock-admin"}`（需 `ENABLE_MOCK_LOGIN=true`）获取管理员 JWT。**production 禁止** `ENABLE_MOCK_LOGIN`（启动校验）。

**本地 MySQL（可选）**：`docker compose up -d` 启动根目录 `docker-compose.yml` 中的 MySQL 8，再将 `.env` 中 `DATABASE_URL` 指向 `mysql://root:football@127.0.0.1:3306/football_ai_report` 后执行 migrate/seed。

**单元测试**：`npm test`（Jest）。Phase D 起包含：`GET /matches/:id/intel` 与 `getMatchDetail` 的**未解锁 / 已付费解锁 / 管理员**契约（`src/matches/match-intel.contract.spec.ts`）、单场管线「比赛不存在」边界（`src/match-intel-pipeline/match-intel-pipeline.service.spec.ts`）、DeepSeek mock 判定与 smoke（`deepseek-env` / `deepseek.service`）、Phase B Zod 等。

**高并发、限流与读缓存**：见 **`高并发与容量.md`**（HTTP 限流、`football-feed` 收紧、DeepSeek 并发槽、**可选 Redis** 与 **CDN 头**）。**非 production** 下本地极限压测可短时 `HTTP_THROTTLE_DISABLED=true`；**production 禁止**（启动校验）。读缓存与失效见 **`Redis与边缘缓存.md`**。

### Phase D 抽检清单（预发 / 上线前人工）

1. **数据库**：`npx prisma migrate deploy` 已执行；关键表可 `npx prisma db execute --stdin` 或客户端抽查 `MatchPipelineRun`（若有 Phase C 管线）。
2. **健康**：`GET /health` 与 `GET /health?db=1`。
3. **鉴权**：未登录 `GET /matches/:id/intel` → `meta.isUnlocked=false`、`paid=null`；带已解锁用户 JWT 后 `paid` 非空；管理员见草稿摘要（与契约测试一致）。
4. **Admin API**：`GET /admin/deepseek/smoke`（JWT+Admin）；`POST /admin/matches/:id/pipeline/intel-full`（可选 Body 跳过天气/FD 等）观察 `success.data.status` 与 `steps`。
5. **管理后台**：登录 `/admin-view/login`，单场页「Phase C 全管线」与原有分步按钮；重定向 `?ok=` / `?err=` 文案合理。
6. **第三方**：`FOOTBALL_DATA_API_KEY`、`DEEPSEEK_API_KEY`（关 mock）、`QWEATHER_API_KEY` 在目标环境逐项验证或接受「部分步骤 FAILED / PARTIAL」并查 `ApiLog`。

**DeepSeek**：`ENABLE_MOCK_DEEPSEEK=false` 且配置 `DEEPSEEK_API_KEY` 时，战术沙盘与球员画像生成会调用真实 API；失败时自动回退规则占位，避免整请求崩溃。

**LLM 分层档案（赛前报告）**：管理员 `GET /matches/:id/llm-dossier`（可加 `?prepare=1` 先跑 FD 单场 intel + 公开来源再组装）可预览 `dataAvailability` 与各层摘要。`POST /matches/:id/generate-report` 默认会先执行上述补强再从库组装档案入模；管线末尾一步会跳过重复外呼（仅用已写入库的数据）。

**付费与定价（V2，与《越位线_完整收费体系_V2.md》对齐）**

- **公开价目**：`GET /orders/pricing`（无需 JWT）返回各 SKU 金额（分），与下单一致。
- **单场报告解锁**：`POST /orders/matches/:matchId/create`（需登录）。`Match.isFeatured=true` 时使用 **`FEATURED_REPORT_UNLOCK`** 与 `FEATURED_REPORT_UNLOCK_PRICE_CENTS`（默认 **990=¥9.9**）；否则 **`REPORT_UNLOCK`** + `REPORT_UNLOCK_PRICE_CENTS`（默认 **690=¥6.9**）。已完赛且已登录仍免费开放情报，无需下单。支付成功回调写入 **`PaymentUnlock`**。
- **Pro 会员**：`POST /orders/membership/create`，body `{"plan":"month"|"quarter"|"year"}`；订单 `product` 为 `MEMBERSHIP_PRO_*`，`matchId` 可为空。支付成功回调将 **`User.membershipUntil`** 从 max(当前, 原到期) 起顺延 1/3/12 个自然月/年。**有效期内情报全量解锁**（与单场解锁二选一逻辑见 `UnlockService.canAccessPaidIntel`）。
- **社交海报（GPT-Image2 兼容）**：`POST /matches/:id/social-poster/generate`，body `{"customElements":"…"}`（足球相关，2～120 字）。计费：**Pro（membershipUntil 有效）无限** → 否则 **UTC 自然月 1 张免费**（`posterFreeUtcYearMonth` / `posterFreeUsedInMonth`）→ 否则需已支付 **`POST /orders/social-poster/matches/:matchId/create`**（`SOCIAL_POSTER`，默认 **490=¥4.9**）。配置 **`GPT_IMAGE2_BASE_URL`** + **`GPT_IMAGE2_API_KEY`**；未就绪时可设 **`ENABLE_POSTER_IMAGE_MOCK=true`**。管理员可 `GET /matches/:id/social-poster/prompt-preview?customElements=...`（Admin JWT）。微信回调对 `SOCIAL_POSTER` 仅将订单置 **`PAID`**，**不**写 `PaymentUnlock`。
- **数据库**：含 `Order` 商品枚举扩展、`Order.matchId` 可空、用户海报月度字段的迁移见 **`prisma/migrations/20260506180000_billing_v2_products_membership`**；部署执行 **`npx prisma migrate deploy`**。

**公开来源**（管理端 `POST /public-sources/matches/:id/fetch`）：会顺序拉取 **Wikipedia**、**ESPN scoreboard**（依赖 `Competition.code` / `Tournament.code` 可映射到 ESPN 联赛 slug）、**FIFA 公开日历 API**、（欧战相关时）**UEFA 站内搜索链接**、**worldfootball.net 搜索链接**。外链类来源不解析 HTML、不编造比分；部分站点可能对服务端请求返回 403，属预期之一，可在浏览器中打开 `SourceRecord.sourceUrl` 人工核对。

- **定时分阶段**：在 **`ENABLE_CRON_SYNC=true`** 且 **`ENABLE_PUBLIC_SOURCE_FETCH=true`** 时，Cron 每 **10 分钟** 尝试：开球前约 **48h / 8h / 2h** 各一轮；**完场后**补一轮条件为 `FINISHED` 且尚未写 `publicSourcesPhasePostAt`，且（**`updatedAt` 在约 45 分钟内** *或* **开球后约 95～150 分钟**，用于「终场后一刻钟」量级）。各阶段在 `Match` 上写 `publicSourcesPhase*At` 去重。
- **手动冷却**：同一比赛 **5 分钟内**已写入过的 `sourceType` 默认跳过；需要立即全量重拉时加 **`?force=true`**。
- **先列球队再核对**：`GET /public-sources/competitions/:competitionId/teams-for-fetch?seasonId=`（管理员 JWT）返回该杯赛实例赛程中出现过的球队并集，便于对齐英名；ESPN 路径下会额外用 **联赛 roster → 主队 schedule** 缩小查询（仍写入同一条 ESPN 记录的正文附录）。

**管理后台安全（生产）**：`NODE_ENV=production` 下，对 `POST /admin-view/**`（登录/session 除外）校验 `Origin`/`Referer` 与请求 `Host` 一致，降低跨站提交风险；命令行调用需带合法 `Origin` 头。

## Sealos 部署（摘要）

1. 在 Sealos 创建 MySQL，将内网 `DATABASE_URL` 写入应用环境变量。管理后台密码：使用本仓库 **Dockerfile** 或 **`npm start`** 构建的镜像/进程时，若未在控制台配置 **`ADMIN_VIEW_LOGIN_*`**，会自动读取镜像内的 **`deploy/sealos-admin-login.env`**（与本地默认账号一致）；若要在 Sealos 覆盖，在应用环境变量中显式设置这两项即可。
2. 使用仓库内 `Dockerfile` 构建镜像并部署应用（镜像内 **`NODE_ENV=production`**，默认监听 **8080**）。若不用镜像、直接在 Devbox 执行 `node dist/main.js`，请设置 **`PORT=8080`** 或 **`NODE_ENV=production`**，与 Ingress 一致。
3. 部署后**手动**执行（不要在镜像 CMD 里自动 migrate，见《开发文档》）：
   - `npx prisma migrate deploy`
   - `npx prisma db seed`（首次或需要演示数据时）
4. **环境变量清单（除数据库外常用）**：`JWT_SECRET`（**production 须 ≥24 字符且非占位**）、**`CORS_ORIGIN`**（**production 须逗号分隔白名单，禁止 `*`**）、**`API_FOOTBALL_API_KEY`**（赛程/阵容入库与近窗 AF 轮询；见 **`环境变量配置.md`**）、`FOOTBALL_DATA_API_KEY`、`QWEATHER_*`、`DEEPSEEK_API_KEY`（若关闭 mock）、`ENABLE_MOCK_DEEPSEEK`、`ENABLE_CRON_SYNC`、`AUTO_INTEL_CRON_MODE`（`off` / `prediction` / `full`）及 **`AUTO_INTEL_*`** 时间窗与上限（见 `.env.example`）、**V2 定价**（`REPORT_UNLOCK_PRICE_CENTS`、`FEATURED_REPORT_UNLOCK_PRICE_CENTS`、`SOCIAL_POSTER_PRICE_CENTS`、`MEMBERSHIP_PRO_*_CENTS`）、小程序与支付相关 `WECHAT_*` / `WX_PAY_*`（支付联调就绪后再配）、**可选 Redis**（`REDIS_URL` 等，见 `.env.example`）。开通 api-sports 付费套餐后可用 Admin JWT 调 **`GET /admin/api-football/status`** 验证 Key 与当日剩余请求（上游 `GET /status`）。
5. **排障**：容器无响应时查 `GET /health?db=1`；第三方失败查 `GET /admin/api-logs` 或表 `ApiLog`；管理页操作失败看浏览器重定向后的 `?err=` 文案。
6. 配置微信小程序 `request` 合法域名与微信支付回调 URL（如 `https://你的域名/wxpay/notify`）。
7. 将微信支付私钥放入 `certs/`（路径与 `WX_PAY_PRIVATE_KEY_PATH` 一致），**勿将私钥提交 git**。商户未就绪时可不配 `WX_PAY_*`，开发占位见 `ENABLE_WXPAY_DEV_PLACEHOLDER`；**生产验签与 JSAPI 真实 prepay 参数**仍以《验收对照》与 `WxpayService` 说明为准。

### 公网地址（生产环境）

根域名：**[https://oaifjhzmpswi.sealosbja.site](https://oaifjhzmpswi.sealosbja.site)**

| 用途 | URL |
|------|-----|
| 健康检查 | `https://oaifjhzmpswi.sealosbja.site/health`（可加 `?db=1` 测库） |
| Swagger | 默认 **无** `/docs`；需 **`ENABLE_SWAGGER_DOCS=true`** 后 `https://oaifjhzmpswi.sealosbja.site/docs` |
| 管理后台登录 | `https://oaifjhzmpswi.sealosbja.site/admin-view/login` |
| 微信支付回调（环境变量） | `WX_PAY_NOTIFY_URL=https://oaifjhzmpswi.sealosbja.site/wxpay/notify` |

微信小程序「服务器域名」**request 合法域名**需配置为：`https://oaifjhzmpswi.sealosbja.site`（与微信后台要求一致，勿带末尾路径）。

若平台仍用 **`node hello_world.js`** 启动：该脚本会加载 **`dist/main.js`**（需先 **`npm run build`**）；未设 `PORT` 时与主程序一致（**production → 8080**，否则 **3000**）。**`npm start`** 为 `node dist/main.js`。根路径 **`GET /`**：**非 production** 或开启 **`ENABLE_SWAGGER_DOCS`** 时 **302 → `/docs`**；否则返回纯文本服务名。Sealos Ingress 须与容器实际 **`PORT`** 一致；生产镜像已设 **`NODE_ENV=production`**。

## 脚本说明

| 命令 | 说明 |
|------|------|
| `npm run build` | 编译 |
| `npm run start:dev` | 开发热重载 |
| `npm run start:prod` | 运行已编译的 `dist/main.js` |
| `npm run db:ping` | 检查 MySQL 连接（脚本） |
| `npm run db:setup` | `prisma migrate deploy` + `prisma db seed`（推荐新库一键） |
| `npm run prisma:deploy` / `npm run prisma:seed` | 仅迁移 / 仅种子 |
| `npm run audit:schedule` | 库内赛程与 football-data 对照审计（需 `FOOTBALL_DATA_API_KEY`） |
| `npm run stats:match-report` | 库内比赛只读统计报表（终端） |
| `npm run generate:wc2026-overrides` | 生成世界杯 2026 详情覆盖 JSON（维护种子用） |
| `npm test` | Jest 单元测试 |
