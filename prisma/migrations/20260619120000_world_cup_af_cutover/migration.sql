-- World Cup AF-only cutover: remove ELO, add intel hashes and stale tracking

ALTER TABLE `Team` DROP COLUMN `eloRating`;

ALTER TABLE `Match`
  ADD COLUMN `intelContentHash` VARCHAR(191) NULL,
  ADD COLUMN `intelContentHashAt` DATETIME(3) NULL,
  ADD COLUMN `venueName` VARCHAR(191) NULL,
  ADD COLUMN `venueApiFootballId` INT NULL;

ALTER TABLE `MatchAfRawBundle` ADD COLUMN `endpointHashes` JSON NULL;

ALTER TABLE `TeamMatchSnapshot`
  MODIFY COLUMN `attackRating` DOUBLE NULL,
  MODIFY COLUMN `defenseRating` DOUBLE NULL,
  ADD COLUMN `contentHash` VARCHAR(191) NULL;

ALTER TABLE `WeatherSnapshot` ADD COLUMN `contentHash` VARCHAR(191) NULL;

ALTER TABLE `AiReport`
  ADD COLUMN `sourceIntelHash` VARCHAR(191) NULL,
  ADD COLUMN `isStale` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `staleReason` VARCHAR(191) NULL,
  ADD COLUMN `staleDetectedAt` DATETIME(3) NULL;
