-- AlterTable
ALTER TABLE `User` ADD COLUMN `appleSub` VARCHAR(191) NULL,
    ADD COLUMN `googleSub` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_appleSub_key` ON `User`(`appleSub`);
CREATE UNIQUE INDEX `User_googleSub_key` ON `User`(`googleSub`);
