-- AlterTable
ALTER TABLE `User` ADD COLUMN `wechatWebOpenid` VARCHAR(191) NULL,
    ADD COLUMN `email` VARCHAR(191) NULL,
    ADD COLUMN `username` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_wechatWebOpenid_key` ON `User`(`wechatWebOpenid`);
CREATE UNIQUE INDEX `User_email_key` ON `User`(`email`);
CREATE UNIQUE INDEX `User_username_key` ON `User`(`username`);
