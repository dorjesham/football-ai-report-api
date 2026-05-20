-- LeagueAfCache B2 columns
ALTER TABLE `LeagueAfCache` ADD COLUMN `topYellowCardsJson` JSON NULL;
ALTER TABLE `LeagueAfCache` ADD COLUMN `topRedCardsJson` JSON NULL;
ALTER TABLE `LeagueAfCache` ADD COLUMN `fixtureRoundsJson` JSON NULL;

-- B4
CREATE TABLE `AfTransferRaw` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `apiTeamId` INTEGER NOT NULL,
    `season` INTEGER NOT NULL,
    `payloadJson` JSON NOT NULL,
    `syncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `AfTransferRaw_teamId_season_key`(`teamId`, `season`),
    INDEX `AfTransferRaw_apiTeamId_season_idx`(`apiTeamId`, `season`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AfTrophyRaw` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NULL,
    `playerId` VARCHAR(191) NULL,
    `apiEntityId` INTEGER NULL,
    `payloadJson` JSON NOT NULL,
    `syncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `AfTrophyRaw_teamId_key`(`teamId`),
    UNIQUE INDEX `AfTrophyRaw_playerId_key`(`playerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AfSidelinedRaw` (
    `id` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `apiPlayerId` INTEGER NULL,
    `payloadJson` JSON NOT NULL,
    `syncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `AfSidelinedRaw_playerId_key`(`playerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- B5
CREATE TABLE `MatchOddsLiveSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `apiFootballFixtureId` INTEGER NOT NULL,
    `provider` ENUM('API_FOOTBALL', 'FOOTBALL_DATA', 'DEEPSEEK', 'MODEL', 'PUBLIC_WEB', 'MANUAL', 'UNKNOWN') NOT NULL DEFAULT 'API_FOOTBALL',
    `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `marketsJson` JSON NOT NULL,
    `rawOdds` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `MatchOddsLiveSnapshot_matchId_capturedAt_idx`(`matchId`, `capturedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AfOddsMetaCache` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `payloadJson` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `AfOddsMetaCache_kind_key`(`kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AfTransferRaw` ADD CONSTRAINT `AfTransferRaw_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AfTrophyRaw` ADD CONSTRAINT `AfTrophyRaw_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AfTrophyRaw` ADD CONSTRAINT `AfTrophyRaw_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AfSidelinedRaw` ADD CONSTRAINT `AfSidelinedRaw_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MatchOddsLiveSnapshot` ADD CONSTRAINT `MatchOddsLiveSnapshot_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
