-- Greenfield cutover: publishedKey, AiReport dedupe, IngestJobItem

ALTER TABLE `AiReport` ADD COLUMN `publishedKey` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `AiReport_publishedKey_key` ON `AiReport`(`publishedKey`);

CREATE UNIQUE INDEX `AiReport_matchId_reportType_inputHash_key` ON `AiReport`(`matchId`, `reportType`, `inputHash`);

CREATE TABLE `IngestJobItem` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NULL,
    `itemType` VARCHAR(191) NOT NULL DEFAULT 'match',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `currentStep` VARCHAR(191) NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` TEXT NULL,
    `metadataJson` JSON NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `IngestJobItem_jobId_status_idx`(`jobId`, `status`),
    INDEX `IngestJobItem_matchId_createdAt_idx`(`matchId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `IngestJobItem` ADD CONSTRAINT `IngestJobItem_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `IngestJobRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX `IngestJobRun_bundleId_status_idx` ON `IngestJobRun`(`bundleId`, `status`);
