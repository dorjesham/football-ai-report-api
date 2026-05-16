-- CreateTable
CREATE TABLE `UserTeamFollow` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserTeamFollow_userId_idx`(`userId`),
    UNIQUE INDEX `UserTeamFollow_userId_teamId_key`(`userId`, `teamId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Order_userId_matchId_product_idx` ON `Order`(`userId`, `matchId`, `product`);

-- AddForeignKey
ALTER TABLE `UserTeamFollow` ADD CONSTRAINT `UserTeamFollow_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserTeamFollow` ADD CONSTRAINT `UserTeamFollow_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
