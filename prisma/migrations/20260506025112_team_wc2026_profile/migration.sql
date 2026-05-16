-- AlterTable
ALTER TABLE `Team` ADD COLUMN `wc2026Profile` JSON NULL,
    ADD COLUMN `wcGroup` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Team_wcGroup_idx` ON `Team`(`wcGroup`);
