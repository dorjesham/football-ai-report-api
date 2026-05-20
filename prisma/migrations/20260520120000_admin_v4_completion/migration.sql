-- AlterTable
ALTER TABLE `User` ADD COLUMN `adminConsoleRole` ENUM('SUPER_ADMIN', 'OPS_ADMIN', 'CONTENT_ADMIN', 'FINANCE_ADMIN', 'READONLY', 'DEVELOPER') NULL;

-- CreateTable
CREATE TABLE `AfQuotaDailySnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `used` INTEGER NOT NULL DEFAULT 0,
    `limit` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AfQuotaDailySnapshot_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserGeneratedAsset` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `assetType` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `url` VARCHAR(191) NULL,
    `metadataJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserGeneratedAsset_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `UserGeneratedAsset_matchId_createdAt_idx`(`matchId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserGeneratedAsset` ADD CONSTRAINT `UserGeneratedAsset_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
