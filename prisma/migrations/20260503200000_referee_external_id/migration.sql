-- Referee：football-data.org Person id，用于单场详情同步与去重

ALTER TABLE `Referee`
  ADD COLUMN `externalId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Referee_externalId_key` ON `Referee` (`externalId`);
