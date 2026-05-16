-- CreateTable
CREATE TABLE `MatchPipelineRun` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'INTEL_FULL_V1',
    `status` ENUM('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'RUNNING',
    `deepseekReal` BOOLEAN NOT NULL DEFAULT false,
    `steps` JSON NOT NULL,
    `summary` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `MatchPipelineRun_matchId_createdAt_idx`(`matchId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MatchPipelineRun` ADD CONSTRAINT `MatchPipelineRun_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
