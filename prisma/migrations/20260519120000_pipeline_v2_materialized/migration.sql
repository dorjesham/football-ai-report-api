-- CompetitionStanding（索引名 ≤64 字符，兼容 MySQL）
CREATE TABLE `CompetitionStanding` (
    `id` VARCHAR(191) NOT NULL,
    `competitionId` VARCHAR(191) NOT NULL,
    `seasonYear` INTEGER NOT NULL,
    `groupName` VARCHAR(191) NOT NULL DEFAULT '',
    `rank` INTEGER NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `points` INTEGER NULL,
    `played` INTEGER NULL,
    `won` INTEGER NULL,
    `draw` INTEGER NULL,
    `lost` INTEGER NULL,
    `goalsFor` INTEGER NULL,
    `goalsAgainst` INTEGER NULL,
    `goalDiff` INTEGER NULL,
    `form` VARCHAR(191) NULL,
    `extra` JSON NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `cs_comp_season_idx`(`competitionId`, `seasonYear`),
    UNIQUE INDEX `cs_season_team_grp_uq`(`competitionId`, `seasonYear`, `teamId`, `groupName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- PlayerSeasonMetric
CREATE TABLE `PlayerSeasonMetric` (
    `id` VARCHAR(191) NOT NULL,
    `competitionId` VARCHAR(191) NOT NULL,
    `seasonYear` INTEGER NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NULL,
    `metric` VARCHAR(191) NOT NULL,
    `value` DOUBLE NOT NULL,
    `rank` INTEGER NULL,
    `goals` INTEGER NULL,
    `assists` INTEGER NULL,
    `extra` JSON NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `psm_comp_season_metric_idx`(`competitionId`, `seasonYear`, `metric`),
    UNIQUE INDEX `psm_season_player_metric_uq`(`competitionId`, `seasonYear`, `playerId`, `metric`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- MatchFacts.injuriesJson
ALTER TABLE `MatchFacts` ADD COLUMN `injuriesJson` JSON NULL;

-- IngestJobRun progress
ALTER TABLE `IngestJobRun` ADD COLUMN `bundleId` VARCHAR(191) NULL,
    ADD COLUMN `parentJobId` VARCHAR(191) NULL,
    ADD COLUMN `progressPct` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `stepLabel` VARCHAR(191) NULL;

CREATE INDEX `ingest_bundle_started_idx` ON `IngestJobRun`(`bundleId`, `startedAt`);

-- Foreign keys
ALTER TABLE `CompetitionStanding` ADD CONSTRAINT `cs_competitionId_fkey` FOREIGN KEY (`competitionId`) REFERENCES `Competition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CompetitionStanding` ADD CONSTRAINT `cs_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PlayerSeasonMetric` ADD CONSTRAINT `psm_competitionId_fkey` FOREIGN KEY (`competitionId`) REFERENCES `Competition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PlayerSeasonMetric` ADD CONSTRAINT `psm_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PlayerSeasonMetric` ADD CONSTRAINT `psm_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
