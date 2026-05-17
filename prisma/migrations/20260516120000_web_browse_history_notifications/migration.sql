-- CreateTable
CREATE TABLE `UserBrowseHistory` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('ANALYSIS', 'POSTER', 'VIEW') NOT NULL,
    `matchId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `sub` VARCHAR(191) NULL,
    `visitedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserBrowseHistory_userId_matchId_type_key`(`userId`, `matchId`, `type`),
    INDEX `UserBrowseHistory_userId_visitedAt_idx`(`userId`, `visitedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserNotification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('ORDER_PAID', 'POSTER_READY', 'POSTER_CREDIT', 'MEMBERSHIP', 'SYSTEM') NOT NULL DEFAULT 'SYSTEM',
    `title` VARCHAR(191) NOT NULL,
    `desc` TEXT NOT NULL,
    `read` BOOLEAN NOT NULL DEFAULT false,
    `icon` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `link` VARCHAR(191) NULL,
    `orderNo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserNotification_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `UserNotification_userId_read_idx`(`userId`, `read`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserBrowseHistory` ADD CONSTRAINT `UserBrowseHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserBrowseHistory` ADD CONSTRAINT `UserBrowseHistory_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserNotification` ADD CONSTRAINT `UserNotification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
