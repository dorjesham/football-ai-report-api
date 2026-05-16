-- AlterTable
ALTER TABLE `Team` ADD COLUMN `powerRating` DOUBLE NULL,
    ADD COLUMN `powerRatingMeta` JSON NULL,
    ADD COLUMN `powerRatingAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Player` ADD COLUMN `powerRating` DOUBLE NULL,
    ADD COLUMN `powerRatingMeta` JSON NULL,
    ADD COLUMN `powerRatingAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `MatchPrediction` ADD COLUMN `homeMatchPower` DOUBLE NULL,
    ADD COLUMN `awayMatchPower` DOUBLE NULL;
