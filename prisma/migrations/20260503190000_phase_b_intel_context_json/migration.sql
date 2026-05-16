-- Phase B: MatchIntel 扩展 — 裁判矩阵对照、主场历史同期、Fantasy 三套阵容（JSON 契约）

ALTER TABLE `RefereeSnapshot`
  ADD COLUMN `leagueBenchmarks` JSON NULL,
  ADD COLUMN `homeTeamRefHistory` JSON NULL,
  ADD COLUMN `awayTeamRefHistory` JSON NULL;

ALTER TABLE `WeatherSnapshot`
  ADD COLUMN `venueHistoricalContext` JSON NULL;

ALTER TABLE `FantasyAdvice`
  ADD COLUMN `lineupLaboratory` JSON NULL;
