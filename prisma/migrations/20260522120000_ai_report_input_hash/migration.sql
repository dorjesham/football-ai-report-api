-- AlterTable (MySQL)
ALTER TABLE `AiReport` ADD COLUMN `inputHash` VARCHAR(191) NULL,
    ADD COLUMN `promptVersion` VARCHAR(191) NULL,
    ADD COLUMN `sourceDataUpdatedAt` DATETIME(3) NULL,
    ADD COLUMN `source` VARCHAR(191) NULL DEFAULT 'deepseek';
