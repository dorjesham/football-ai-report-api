-- CreateTable
CREATE TABLE `MatchTacticalSandbox` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `phase` VARCHAR(191) NOT NULL,
    `schema` VARCHAR(191) NOT NULL DEFAULT 'tactical-sandbox-v2',
    `contentJson` JSON NOT NULL,
    `rawInput` JSON NULL,
    `rawOutput` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MatchTacticalSandbox_matchId_key`(`matchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MatchTacticalSandbox` ADD CONSTRAINT `MatchTacticalSandbox_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
