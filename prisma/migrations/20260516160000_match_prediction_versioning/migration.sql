-- MatchPrediction versioning + active pointer + grading table

-- 1) Add columns before backfill / indexes
ALTER TABLE `Match` ADD COLUMN `activePredictionId` VARCHAR(191) NULL;

ALTER TABLE `MatchPrediction`
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `lockedAt` DATETIME(3) NULL,
    ADD COLUMN `inputsHash` VARCHAR(191) NULL,
    ADD COLUMN `predictionMarkets` JSON NULL,
    ADD COLUMN `oddsSnapshotId` VARCHAR(191) NULL;

-- 2) Backfill active pointer from existing 1:1 predictions
UPDATE `Match` m
INNER JOIN `MatchPrediction` p ON p.`matchId` = m.`id`
SET m.`activePredictionId` = p.`id`
WHERE m.`activePredictionId` IS NULL;

-- 3) Replace unique on matchId with composite unique (keep FK index)
CREATE INDEX `MatchPrediction_matchId_idx` ON `MatchPrediction`(`matchId`);
ALTER TABLE `MatchPrediction` DROP INDEX `MatchPrediction_matchId_key`;
CREATE UNIQUE INDEX `MatchPrediction_matchId_version_key` ON `MatchPrediction`(`matchId`, `version`);
CREATE INDEX `MatchPrediction_matchId_createdAt_idx` ON `MatchPrediction`(`matchId`, `createdAt`);

-- 4) FK oddsSnapshot + activePrediction
CREATE UNIQUE INDEX `Match_activePredictionId_key` ON `Match`(`activePredictionId`);
ALTER TABLE `MatchPrediction` ADD CONSTRAINT `MatchPrediction_oddsSnapshotId_fkey` FOREIGN KEY (`oddsSnapshotId`) REFERENCES `MatchOddsSnapshot`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Match` ADD CONSTRAINT `Match_activePredictionId_fkey` FOREIGN KEY (`activePredictionId`) REFERENCES `MatchPrediction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) Grading table
CREATE TABLE `MatchPredictionGrading` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `predictionId` VARCHAR(191) NOT NULL,
    `gradedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualOutcome` JSON NOT NULL,
    `metricsJson` JSON NOT NULL,
    `oddsSnapshotId` VARCHAR(191) NULL,

    UNIQUE INDEX `MatchPredictionGrading_predictionId_key`(`predictionId`),
    INDEX `MatchPredictionGrading_matchId_gradedAt_idx`(`matchId`, `gradedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MatchPredictionGrading` ADD CONSTRAINT `MatchPredictionGrading_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MatchPredictionGrading` ADD CONSTRAINT `MatchPredictionGrading_predictionId_fkey` FOREIGN KEY (`predictionId`) REFERENCES `MatchPrediction`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
