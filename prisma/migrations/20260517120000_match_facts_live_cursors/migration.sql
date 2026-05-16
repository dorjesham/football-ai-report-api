-- Phase 4: live sync cursors on MatchFacts

ALTER TABLE `MatchFacts` ADD COLUMN `afLiveLastSyncedAt` DATETIME(3) NULL,
    ADD COLUMN `fdLiveLastSyncedAt` DATETIME(3) NULL,
    ADD COLUMN `liveMetaJson` JSON NULL;
