-- Phase 7: 多源参考事实（不参与 canonical 覆盖，除非人工确认）

ALTER TABLE `MatchFacts` ADD COLUMN `supplementaryFacts` JSON NULL;
