-- Match 轮次/回合
ALTER TABLE `Match` ADD COLUMN `matchday` INTEGER NULL;
ALTER TABLE `Match` ADD COLUMN `leg` INTEGER NULL;

-- Player 扩展档案（非结构化子项用 JSON，由 Zod/业务层约束）
ALTER TABLE `Player` ADD COLUMN `profile` JSON NULL;

-- 单场事实包
CREATE TABLE `MatchFacts` (
    `matchId` VARCHAR(191) NOT NULL,
    `minuteRegulation` INTEGER NULL,
    `attendance` INTEGER NULL,
    `htHome` INTEGER NULL,
    `htAway` INTEGER NULL,
    `ftHome` INTEGER NULL,
    `ftAway` INTEGER NULL,
    `etHome` INTEGER NULL,
    `etAway` INTEGER NULL,
    `penHome` INTEGER NULL,
    `penAway` INTEGER NULL,
    `teamStats` JSON NULL,
    `lineups` JSON NULL,
    `events` JSON NULL,
    `officials` JSON NULL,
    `venueDetail` JSON NULL,
    `weatherDetail` JSON NULL,
    `rawFdMatch` JSON NULL,
    `rawOpenfootball` JSON NULL,
    `externalRefs` JSON NULL,
    `primaryProvider` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `structureProvider` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NULL,
    `providerTag` VARCHAR(191) NULL,
    `lastSyncedAt` DATETIME(3) NULL,
    `validatedAt` DATETIME(3) NULL,
    `validationLog` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`matchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MatchFacts` ADD CONSTRAINT `MatchFacts_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `IngestJobRun` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'RUNNING',
    `params` JSON NULL,
    `resultSummary` JSON NULL,
    `errorMessage` TEXT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `IngestJobRun_kind_startedAt_idx` ON `IngestJobRun`(`kind`, `startedAt`);
