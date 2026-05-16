-- Phase 5: AiReport types, REVIEW status, prediction/odds binding

-- Match.reportStatus shares ReportStatus enum
ALTER TABLE `Match` MODIFY `reportStatus` ENUM('NONE', 'DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE `AiReport` ADD COLUMN `reportType` ENUM('PRE_MATCH', 'POST_MATCH', 'LIVE_NARRATIVE') NOT NULL DEFAULT 'PRE_MATCH',
    ADD COLUMN `predictionId` VARCHAR(191) NULL,
    ADD COLUMN `oddsSnapshotId` VARCHAR(191) NULL,
    ADD COLUMN `structuredContentJson` JSON NULL,
    ADD COLUMN `factCheckJson` JSON NULL,
    ADD COLUMN `reviewedAt` DATETIME(3) NULL,
    ADD COLUMN `reviewedByUserId` VARCHAR(191) NULL,
    MODIFY `status` ENUM('NONE', 'DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT';

-- CreateIndex
CREATE INDEX `AiReport_matchId_reportType_status_idx` ON `AiReport`(`matchId`, `reportType`, `status`);

-- AddForeignKey
ALTER TABLE `AiReport` ADD CONSTRAINT `AiReport_predictionId_fkey` FOREIGN KEY (`predictionId`) REFERENCES `MatchPrediction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiReport` ADD CONSTRAINT `AiReport_oddsSnapshotId_fkey` FOREIGN KEY (`oddsSnapshotId`) REFERENCES `MatchOddsSnapshot`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
