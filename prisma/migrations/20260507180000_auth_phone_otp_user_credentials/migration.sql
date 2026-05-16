-- AlterTable: allow phone-first users without WeChat yet
ALTER TABLE `User` MODIFY `openid` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `phone` VARCHAR(20) NULL;
ALTER TABLE `User` ADD COLUMN `phoneVerifiedAt` DATETIME(3) NULL;
ALTER TABLE `User` ADD COLUMN `passwordHash` VARCHAR(255) NULL;

CREATE UNIQUE INDEX `User_phone_key` ON `User`(`phone`);

-- CreateTable
CREATE TABLE `AuthPhoneOtp` (
    `id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuthPhoneOtp_phone_createdAt_idx`(`phone`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
