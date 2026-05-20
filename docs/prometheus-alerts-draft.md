# Prometheus 告警规则草稿（指南终章 PR-10）

指标暴露在 `GET /metrics`（`MetricsModule`）。

## 建议告警

| 指标 | 条件 | 说明 |
|------|------|------|
| `af_sync_success_rate` | &lt; 0.85 持续 30m | AF 同步失败率偏高 |
| `detail_v2_request_duration_seconds` | p95 &gt; 3s 持续 15m | 详情接口变慢 |
| `predictions_present_ratio` | &lt; 0.5 且近窗有赛 | bundle 缺 predictions |
| `odds_live_sync_total{result="fail"}` | rate 5m &gt; 0.5 | 赛中赔率同步失败 |

## 示例（Prometheus rule 片段）

```yaml
groups:
  - name: football-api-v2
    rules:
      - alert: AfSyncSuccessRateLow
        expr: af_sync_success_rate < 0.85
        for: 30m
        labels:
          severity: warning
      - alert: DetailV2LatencyHigh
        expr: histogram_quantile(0.95, sum(rate(detail_v2_request_duration_seconds_bucket[5m])) by (le)) > 3
        for: 15m
        labels:
          severity: warning
```
