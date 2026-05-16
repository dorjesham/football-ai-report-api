-- AlterTable
ALTER TABLE `Order` ADD COLUMN `product` ENUM('REPORT_UNLOCK', 'SOCIAL_POSTER') NOT NULL DEFAULT 'REPORT_UNLOCK',
    ADD COLUMN `posterConsumed` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `socialPosterFreeUsed` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `membershipUntil` DATETIME(3) NULL,
    ADD COLUMN `posterMemberDayKey` INT NULL,
    ADD COLUMN `posterMemberDayCount` INT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `SocialGuide` ADD COLUMN `posterImageUrl` TEXT NULL,
    ADD COLUMN `posterPromptUser` VARCHAR(200) NULL,
    ADD COLUMN `posterPromptFinal` TEXT NULL,
    ADD COLUMN `posterGeneratedAt` DATETIME(3) NULL;
