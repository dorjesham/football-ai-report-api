-- CreateTable
CREATE TABLE `MatchAfRawBundle` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `fixtureId` INTEGER NOT NULL,
    `schemaVersion` INTEGER NOT NULL DEFAULT 1,
    `fixtureJson` JSON NULL,
    `lineupsJson` JSON NULL,
    `eventsJson` JSON NULL,
    `statisticsJson` JSON NULL,
    `playersJson` JSON NULL,
    `injuriesJson` JSON NULL,
    `predictionsJson` JSON NULL,
    `oddsLatestJson` JSON NULL,
    `h2hJson` JSON NULL,
    `homeCoachJson` JSON NULL,
    `awayCoachJson` JSON NULL,
    `homeTeamStatsJson` JSON NULL,
    `awayTeamStatsJson` JSON NULL,
    `homeSquadJson` JSON NULL,
    `awaySquadJson` JSON NULL,
    `standingsSnapshotJson` JSON NULL,
    `topScorersSnapshotJson` JSON NULL,
    `availabilityJson` JSON NULL,
    `fetchedAtJson` JSON NULL,
    `lastErrorJson` JSON NULL,
    `finalized` BOOLEAN NOT NULL DEFAULT false,
    `finalizedAt` DATETIME(3) NULL,
    `syncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MatchAfRawBundle_matchId_key`(`matchId`),
    UNIQUE INDEX `MatchAfRawBundle_fixtureId_key`(`fixtureId`),
    INDEX `MatchAfRawBundle_fixtureId_idx`(`fixtureId`),
    INDEX `MatchAfRawBundle_syncedAt_idx`(`syncedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AfSyncLog` (
    `id` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(191) NOT NULL,
    `paramsJson` JSON NULL,
    `matchId` VARCHAR(191) NULL,
    `fixtureId` INTEGER NULL,
    `httpStatus` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL,
    `responseSize` INTEGER NULL,
    `errorMessage` TEXT NULL,
    `costCount` INTEGER NOT NULL DEFAULT 1,
    `durationMs` INTEGER NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AfSyncLog_endpoint_createdAt_idx`(`endpoint`, `createdAt`),
    INDEX `AfSyncLog_matchId_idx`(`matchId`),
    INDEX `AfSyncLog_fixtureId_idx`(`fixtureId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeagueAfCache` (
    `id` VARCHAR(191) NOT NULL,
    `competitionCode` VARCHAR(191) NOT NULL,
    `season` INTEGER NOT NULL,
    `standingsJson` JSON NULL,
    `topscorersJson` JSON NULL,
    `topAssistsJson` JSON NULL,
    `injuriesJson` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LeagueAfCache_competitionCode_season_key`(`competitionCode`, `season`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MatchAfRawBundle` ADD CONSTRAINT `MatchAfRawBundle_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
