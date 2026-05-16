import { resolveListenPortNumber } from './listen-port.util';
import { rawCorsOriginFromEnv } from './cors-origin-env.util';

export default () => ({
  port: resolveListenPortNumber(),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  corsOrigin: rawCorsOriginFromEnv() || '*',
  /** production 默认关闭 /docs；为 true 时显式开启 Swagger */
  enableSwaggerDocs: process.env.ENABLE_SWAGGER_DOCS === 'true',
  wechatAppId: process.env.WECHAT_APP_ID,
  wechatAppSecret: process.env.WECHAT_APP_SECRET,
  adminBootstrapOpenid: process.env.ADMIN_BOOTSTRAP_OPENID,
  /** 管理后台 EJS 账号密码登录（未设置密码则仅保留 JWT 粘贴登录） */
  adminViewLoginUsername: process.env.ADMIN_VIEW_LOGIN_USERNAME || '',
  adminViewLoginPassword: process.env.ADMIN_VIEW_LOGIN_PASSWORD || '',
  /**
   * 浏览器访问管理后台的 URL 前缀（与 Ingress 对外路径一致）。
   * 默认 `/admin-view`；若对外路径为 `https://host/api/admin-view` 则设为 `/api/admin-view`。
   */
  adminViewPathPrefix:
    process.env.ADMIN_VIEW_PATH_PREFIX?.replace(/\/$/, '') || '/admin-view',
  enableMockLogin: process.env.ENABLE_MOCK_LOGIN === 'true',
  /** 与 JWT_SECRET 分离更佳；未设置时回退 jwtSecret */
  authOtpPepper: process.env.AUTH_OTP_PEPPER,
  authOtpTtlSeconds: parseInt(process.env.AUTH_OTP_TTL_SECONDS || '300', 10),
  /** true 时 /auth/phone/send-code 响应体携带 devCode（仅联调，禁止生产） */
  enableSmsOtpDebug: process.env.ENABLE_SMS_OTP_DEBUG === 'true',
  enableMockDeepseek: process.env.ENABLE_MOCK_DEEPSEEK === 'true',
  enablePublicSourceFetch: process.env.ENABLE_PUBLIC_SOURCE_FETCH === 'true',
  enableCronSync: process.env.ENABLE_CRON_SYNC === 'true',
  /**
   * 与 ENABLE_CRON_SYNC 同时为 true 时：定时**广域**近窗刷新比分/状态（约每 5 分钟）。
   * — Football-Data：单场 GET /matches/{id}（`dataSource=FOOTBALL_DATA`）。
   * — API-Football：GET /fixtures?id=（`externalId` 为 `af-f-*`）；未配置 API Key 时 AF 侧 attempted=0。
   * 因赛程列表常只含未赛场次，开赛后若不再拉单场，库内会长期未更新。
   * 设为 false 可关闭近窗轮询（同时关闭赛中高频任务，见 `enableMatchLiveFastPoll`）。
   */
  enableMatchFdLivePoll:
    process.env.ENABLE_MATCH_FD_LIVE_POLL !== 'false' &&
    process.env.ENABLE_CRON_SYNC === 'true',
  /**
   * 与 ENABLE_CRON_SYNC 且近窗轮询开启时：对「进行中 LIVE」与「已开球仍 SCHEDULED」的场次约每 10 秒拉上游（不落 ApiLog，防刷屏）。
   * 设为 false 则仅保留每 5 分钟广域近窗任务（省第三方配额）。
   */
  enableMatchLiveFastPoll:
    process.env.ENABLE_MATCH_LIVE_FAST_POLL !== 'false' &&
    process.env.ENABLE_CRON_SYNC === 'true' &&
    process.env.ENABLE_MATCH_FD_LIVE_POLL !== 'false',
  /**
   * 与 ENABLE_CRON_SYNC 同时为 true：约每 6 小时对近窗 FINISHED 的 `af-f-*` 写满 MatchFacts
   * （lineups/events/statistics；已完整场次增量 skip）。
   */
  enableAfMatchFactsCron:
    process.env.ENABLE_AF_MATCH_FACTS_CRON === 'true' &&
    process.env.ENABLE_CRON_SYNC === 'true',
  afMatchFactsLookbackDays: parseInt(process.env.AF_MATCH_FACTS_LOOKBACK_DAYS || '14', 10),
  afMatchFactsMaxPerTick: parseInt(process.env.AF_MATCH_FACTS_MAX_PER_TICK || '20', 10),
  afMatchFactsDelayMs: parseInt(process.env.AF_MATCH_FACTS_DELAY_MS || '800', 10),
  /**
   * 与 ENABLE_CRON_SYNC 同时为 true：每 10 分钟检查 T-24h/T-1h 赛前快照与赔率。
   */
  enableAfPreMatchCron:
    process.env.ENABLE_AF_PRE_MATCH_CRON === 'true' &&
    process.env.ENABLE_CRON_SYNC === 'true',
  afPreMatchMaxPerTick: parseInt(process.env.AF_PRE_MATCH_MAX_PER_TICK || '12', 10),
  afPreMatchDelayMs: parseInt(process.env.AF_PRE_MATCH_DELAY_MS || '900', 10),
  /**
   * 与 ENABLE_CRON_SYNC 同时为 true：开球前 5 分钟锁定 active 预测版本。
   */
  enablePredictionLockCron:
    process.env.ENABLE_PREDICTION_LOCK_CRON !== 'false' &&
    process.env.ENABLE_CRON_SYNC === 'true',
  predictionLockMaxPerTick: parseInt(process.env.PREDICTION_LOCK_MAX_PER_TICK || '40', 10),
  /**
   * 与 ENABLE_CRON_SYNC 同时为 true：每日补跑 FINISHED 场次预测对账。
   */
  enablePredictionGradingCron:
    process.env.ENABLE_PREDICTION_GRADING_CRON === 'true' &&
    process.env.ENABLE_CRON_SYNC === 'true',
  predictionGradingMaxPerTick: parseInt(process.env.PREDICTION_GRADING_MAX_PER_TICK || '100', 10),
  predictionGradingLookbackDays: parseInt(process.env.PREDICTION_GRADING_LOOKBACK_DAYS || '30', 10),
  /**
   * 与 ENABLE_CRON_SYNC 同时为 true：赛中增量拉取 AF events/statistics 与 FD 单场详情（默认开）。
   */
  enableAfLiveFactsCron:
    process.env.ENABLE_AF_LIVE_FACTS_CRON !== 'false' &&
    process.env.ENABLE_CRON_SYNC === 'true',
  afLiveFactsIntervalSec: parseInt(process.env.AF_LIVE_FACTS_INTERVAL_SEC || '30', 10),
  afLiveFactsMaxPerTick: parseInt(process.env.AF_LIVE_FACTS_MAX_PER_TICK || '24', 10),
  afLiveFactsDelayMs: parseInt(process.env.AF_LIVE_FACTS_DELAY_MS || '400', 10),
  cacheMatchLiveTtlSec: parseInt(process.env.CACHE_MATCH_LIVE_TTL_SEC || '5', 10),
  cacheMatchPhasePreTtlSec: parseInt(process.env.CACHE_MATCH_PHASE_PRE_TTL_SEC || '30', 10),
  cacheMatchPhasePostTtlSec: parseInt(process.env.CACHE_MATCH_PHASE_POST_TTL_SEC || '60', 10),
  enablePostMatchReportCron:
    process.env.ENABLE_POST_MATCH_REPORT_CRON !== 'false' &&
    process.env.ENABLE_CRON_SYNC === 'true',
  postMatchReportMaxPerTick: parseInt(process.env.POST_MATCH_REPORT_MAX_PER_TICK || '6', 10),
  postMatchReportLookbackHours: parseInt(process.env.POST_MATCH_REPORT_LOOKBACK_HOURS || '24', 10),
  enableLiveNarrativeCron:
    process.env.ENABLE_LIVE_NARRATIVE_CRON !== 'false' &&
    process.env.ENABLE_CRON_SYNC === 'true',
  enableWxpayDevPlaceholder: process.env.ENABLE_WXPAY_DEV_PLACEHOLDER === 'true',
  /** API-Football（api-sports.io v3）主数据源 Key：`x-apisports-key`（首尾空格会去掉） */
  apiFootballApiKey: process.env.API_FOOTBALL_API_KEY?.trim() || undefined,
  apiFootballBaseUrl:
    process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io',
  footballDataApiKey: process.env.FOOTBALL_DATA_API_KEY,
  footballDataBaseUrl: process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4',
  /**
   * StatsBomb Open Data 根路径（不含末尾 `/matches/...`）。
   * 默认 GitHub raw；镜像或自建副本时可改。
   * @see https://github.com/statsbomb/open-data
   */
  statsBombOpenDataBaseUrl:
    process.env.STATS_BOMB_OPEN_DATA_BASE_URL?.replace(/\/$/, '') ||
    'https://raw.githubusercontent.com/statsbomb/open-data/master/data',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  qweatherCredentialId: process.env.QWEATHER_CREDENTIAL_ID,
  qweatherApiKey: process.env.QWEATHER_API_KEY,
  /** 须与控制台「设置」中的 API Host 一致；公共 devapi 域名易 403，见 https://dev.qweather.com/docs/configuration/api-host/ */
  qweatherBaseUrl: process.env.QWEATHER_BASE_URL || 'https://devapi.qweather.com',
  wxPayAppId: process.env.WX_PAY_APP_ID,
  wxPayMchId: process.env.WX_PAY_MCH_ID,
  wxPayApiV3Key: process.env.WX_PAY_API_V3_KEY,
  wxPaySerialNo: process.env.WX_PAY_SERIAL_NO,
  wxPayPrivateKeyPath: process.env.WX_PAY_PRIVATE_KEY_PATH,
  wxPayNotifyUrl: process.env.WX_PAY_NOTIFY_URL,
  /**
   * 仅非 production：为 true 时微信 v3 支付回调跳过验签/解密（本地假回调）。
   * **production 下无效**，始终强制验签。
   */
  wxpayNotifySkipVerify: process.env.WXPAY_NOTIFY_SKIP_VERIFY === 'true',
  /** 可选：微信平台公钥 PEM（生产回调验签；不配则启动时尝试 GET /v3/certificates 拉取） */
  wxPayPlatformPublicKeyPem:
    process.env.WX_PAY_PLATFORM_PUBLIC_KEY_PEM?.replace(/\\n/g, '\n') || undefined,
  /** V2 默认 ¥6.9 */
  reportUnlockPriceCents: parseInt(process.env.REPORT_UNLOCK_PRICE_CENTS || '690', 10),
  /** V2 焦点战等 ¥9.9（Match.isFeatured=true 时使用） */
  featuredReportUnlockPriceCents: parseInt(
    process.env.FEATURED_REPORT_UNLOCK_PRICE_CENTS || '990',
    10,
  ),
  /** V2 默认 ¥4.9 */
  socialPosterPriceCents: parseInt(process.env.SOCIAL_POSTER_PRICE_CENTS || '490', 10),
  /** Pro 月卡 ¥49.9 */
  membershipProMonthCents: parseInt(process.env.MEMBERSHIP_PRO_MONTH_CENTS || '4990', 10),
  /** Pro 季卡 ¥128 */
  membershipProQuarterCents: parseInt(process.env.MEMBERSHIP_PRO_QUARTER_CENTS || '12800', 10),
  /** Pro 年卡 ¥365 */
  membershipProYearCents: parseInt(process.env.MEMBERSHIP_PRO_YEAR_CENTS || '36500', 10),
  /** 开发：跳过社交海报计费与额度（仅本地/联调） */
  enablePosterDevBypass: process.env.ENABLE_POSTER_DEV_BYPASS === 'true',
  /** 未配置图像 Key 时返回占位图 URL，便于跑通流程 */
  enablePosterImageMock: process.env.ENABLE_POSTER_IMAGE_MOCK === 'true',
  gptImage2ApiKey: process.env.GPT_IMAGE2_API_KEY,
  gptImage2BaseUrl: process.env.GPT_IMAGE2_BASE_URL || '',
  gptImage2Path: process.env.GPT_IMAGE2_PATH || '/v1/images/generations',
  gptImage2Model: process.env.GPT_IMAGE2_MODEL || 'gpt-image-2',
  leagueAvgGoals: parseFloat(process.env.LEAGUE_AVG_GOALS || '2.70'),
  homeAdvantageXg: parseFloat(process.env.HOME_ADVANTAGE_XG || '1.08'),
  awayAdvantageXg: parseFloat(process.env.AWAY_ADVANTAGE_XG || '0.94'),
  homeEloAdvantage: parseInt(process.env.HOME_ELO_ADVANTAGE || '65', 10),
  /**
   * 定时自动情报/预测（需 ENABLE_CRON_SYNC=true）。
   * off：不跑 | prediction：仅对缺预测场次调用 generate-prediction | full：跑 Phase C 全管线（默认不在定时里跑 AI 报告，见 autoIntelFullIncludeAiReport）。
   */
  autoIntelCronMode: (process.env.AUTO_INTEL_CRON_MODE || 'off').toLowerCase(),
  autoIntelLookaheadHours: parseInt(process.env.AUTO_INTEL_LOOKAHEAD_HOURS || '72', 10),
  /** 候选窗口左边界：now − lookbackHours，过滤过久未踢的 SCHEDULED */
  autoIntelLookbackHours: parseInt(process.env.AUTO_INTEL_LOOKBACK_HOURS || '12', 10),
  /** 每轮 Cron 最多处理场数 */
  autoIntelMaxPerTick: parseInt(process.env.AUTO_INTEL_MAX_PER_TICK || '8', 10),
  /** 两场之间 sleep，减轻上游与 LLM 压力 */
  autoIntelDelayMs: parseInt(process.env.AUTO_INTEL_DELAY_MS || '2500', 10),
  /** 仅当 AUTO_INTEL_CRON_MODE=full：true 时在管线末尾也跑 AI 报告草稿（成本高，默认 false） */
  autoIntelFullIncludeAiReport: process.env.AUTO_INTEL_FULL_INCLUDE_AI_REPORT === 'true',

  /**
   * 与 ENABLE_CRON_SYNC 同时为 true：定时为窗口内场次生成 AI 报告草稿（无 DRAFT/PUBLISHED 时），避免逐场点后台。
   * 与 AUTO_INTEL 独立：可先跑 prediction 再跑本任务，或关闭 requirePrediction 仅依赖档案数据。
   */
  autoAiReportCronEnabled: process.env.AUTO_AI_REPORT_CRON === 'true',
  autoAiReportLookaheadHours: parseInt(process.env.AUTO_AI_REPORT_LOOKAHEAD_HOURS || '96', 10),
  autoAiReportLookbackHours: parseInt(process.env.AUTO_AI_REPORT_LOOKBACK_HOURS || '12', 10),
  /** SCHEDULED 场次：开球须至少晚于 now 本分钟数，避免临场一分钟重复拉数 */
  autoAiReportMinLeadMinutes: parseInt(process.env.AUTO_AI_REPORT_MIN_LEAD_MINUTES || '120', 10),
  autoAiReportMaxPerTick: parseInt(process.env.AUTO_AI_REPORT_MAX_PER_TICK || '3', 10),
  autoAiReportDelayMs: parseInt(process.env.AUTO_AI_REPORT_DELAY_MS || '8000', 10),
  /** 默认 true：仅当已有 MatchPrediction 时才自动生成报告（输入更完整） */
  autoAiReportRequirePrediction:
    process.env.AUTO_AI_REPORT_REQUIRE_PREDICTION !== 'false',
  /** true 时跳过 FD/公开来源再拉取，仅基于库内档案（省流量；数据可能略旧） */
  autoAiReportSkipExternalPreparation:
    process.env.AUTO_AI_REPORT_SKIP_EXTERNAL === 'true',
  /** DeepSeek 赛前报告 JSON 调用温度，略低更稳 */
  deepseekReportTemperature: parseFloat(process.env.DEEPSEEK_REPORT_TEMPERATURE || '0.35'),
  /**
   * 单进程同时向 DeepSeek 发起的 HTTP 上限（排队 + 槽位，防万人峰无限并发外呼）。
   * 多副本：总并发约等于本值 × 副本数。
   */
  deepseekMaxConcurrent: parseInt(process.env.DEEPSEEK_MAX_CONCURRENT || '80', 10),
  /** 槽满时排队等待的最长时间（毫秒），超时 503 */
  deepseekAcquireWaitMs: parseInt(process.env.DEEPSEEK_ACQUIRE_WAIT_MS || '180000', 10),

  /**
   * 全局限流（每 IP、内存；默认 60s 内 30000 次，支撑大量读请求；同 NAT 大量用户可调大）。
   * 多副本：每副本独立计数，Ingress 轮询时总容量近似线性。
   */
  httpThrottleTtlMs: parseInt(process.env.HTTP_THROTTLE_TTL_MS || '60000', 10),
  httpThrottleLimit: parseInt(process.env.HTTP_THROTTLE_LIMIT || '30000', 10),
  /** true 时关闭 HTTP 限流（仅压测，禁止生产） */
  httpThrottleDisabled: process.env.HTTP_THROTTLE_DISABLED === 'true',

  /**
   * Redis：二选一 — `REDIS_URL`（推荐，如 redis://:pass@host:6379/0）或 `REDIS_HOST` + `REDIS_PORT`。
   * 未配置时读缓存不生效，服务仍可启动。
   */
  redisUrl: process.env.REDIS_URL?.trim() || undefined,
  redisHost: process.env.REDIS_HOST?.trim() || undefined,
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD || undefined,
  redisUsername: process.env.REDIS_USERNAME || undefined,
  redisKeyPrefix: (process.env.REDIS_KEY_PREFIX || 'football:').replace(/\s/g, ''),

  /** GET 比赛列表 JSON 缓存秒数（Redis） */
  cacheMatchesListTtlSec: parseInt(process.env.CACHE_MATCHES_LIST_TTL_SEC || '20', 10),
  /** 匿名用户 GET match intel / detail 缓存秒数 */
  cacheMatchIntelAnonTtlSec: parseInt(process.env.CACHE_MATCH_INTEL_ANON_TTL_SEC || '15', 10),
  cacheMatchDetailAnonTtlSec: parseInt(process.env.CACHE_MATCH_DETAIL_ANON_TTL_SEC || '15', 10),
  /** 登录用户情报/详情缓存（更短，防会员态滞后） */
  cacheMatchIntelUserTtlSec: parseInt(process.env.CACHE_MATCH_INTEL_USER_TTL_SEC || '5', 10),
  cacheMatchDetailUserTtlSec: parseInt(process.env.CACHE_MATCH_DETAIL_USER_TTL_SEC || '5', 10),
  /** 赛事树相关 GET 缓存秒数 */
  cacheTournamentsTtlSec: parseInt(process.env.CACHE_TOURNAMENTS_TTL_SEC || '30', 10),

  /** 是否为浏览器/CDN 写入 Cache-Control（关则不在边缘缓存 JSON） */
  cdnCacheHeadersEnabled: process.env.CDN_CACHE_HEADERS_ENABLED !== 'false',
  /** s-maxage / max-age（秒），匿名可缓存 GET */
  httpCacheSMaxageSec: parseInt(process.env.HTTP_CACHE_S_MAXAGE_SEC || '30', 10),
  httpCacheStaleWhileRevalidateSec: parseInt(
    process.env.HTTP_CACHE_STALE_WHILE_REVALIDATE_SEC || '120',
    10,
  ),
});
