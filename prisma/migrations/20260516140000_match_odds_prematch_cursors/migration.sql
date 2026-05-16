-- AlterTable: pre-match AF snapshot phase cursors on Match
ALTER TABLE `Match` ADD COLUMN `afPreMatchSnapshot24At` DATETIME(3) NULL,
    ADD COLUMN `afPreMatchSnapshot1At` DATETIME(3) NULL,
    ADD COLUMN `afOddsSnapshot24At` DATETIME(3) NULL,
    ADD COLUMN `afOddsSnapshot1At` DATETIME(3) NULL;

-- CreateTable: odds snapshots for pre-match windows
CREATE TABLE `MatchOddsSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `apiFootballFixtureId` INTEGER NOT NULL,
    `phase` VARCHAR(191) NOT NULL,
    `provider` ENUM('API_FOOTBALL', 'FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'MANUAL', 'UNKNOWN') NOT NULL DEFAULT 'API_FOOTBALL',
    `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `marketsJson` JSON NOT NULL,
    `rawOdds` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MatchOddsSnapshot_matchId_phase_provider_key`(`matchId`, `phase`, `provider`),
    INDEX `MatchOddsSnapshot_matchId_capturedAt_idx`(`matchId`, `capturedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MatchOddsSnapshot` ADD CONSTRAINT `MatchOddsSnapshot_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
