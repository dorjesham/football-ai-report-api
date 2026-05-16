-- AlterTable
ALTER TABLE `Match` ADD COLUMN `publicSourcesPhase2At` DATETIME(3) NULL,
    ADD COLUMN `publicSourcesPhase48At` DATETIME(3) NULL,
    ADD COLUMN `publicSourcesPhase8At` DATETIME(3) NULL,
    ADD COLUMN `publicSourcesPhasePostAt` DATETIME(3) NULL;
