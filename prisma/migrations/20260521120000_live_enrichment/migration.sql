-- AlterTable
ALTER TABLE `MatchFacts` ADD COLUMN `liveStatsTimelineJson` JSON NULL,
    ADD COLUMN `liveCommentaryEnrichedJson` JSON NULL;

-- CreateTable
CREATE TABLE `MatchPlayerMatchStat` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `afPlayerId` INTEGER NOT NULL,
    `playerId` VARCHAR(191) NULL,
    `teamSide` VARCHAR(8) NOT NULL,
    `playerName` VARCHAR(191) NOT NULL,
    `playerNameEn` VARCHAR(191) NULL,
    `position` VARCHAR(191) NULL,
    `minutes` INTEGER NULL,
    `rating` DOUBLE NULL,
    `goals` INTEGER NULL,
    `assists` INTEGER NULL,
    `shots` INTEGER NULL,
    `shotsOn` INTEGER NULL,
    `passes` INTEGER NULL,
    `keyPasses` INTEGER NULL,
    `tackles` INTEGER NULL,
    `duelsWon` INTEGER NULL,
    `saves` INTEGER NULL,
    `yellowCards` INTEGER NULL,
    `redCards` INTEGER NULL,
    `rawJson` JSON NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MatchPlayerMatchStat_matchId_afPlayerId_key`(`matchId`, `afPlayerId`),
    INDEX `MatchPlayerMatchStat_matchId_idx`(`matchId`),
    INDEX `MatchPlayerMatchStat_playerId_idx`(`playerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MatchPlayerMatchStat` ADD CONSTRAINT `MatchPlayerMatchStat_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MatchPlayerMatchStat` ADD CONSTRAINT `MatchPlayerMatchStat_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
