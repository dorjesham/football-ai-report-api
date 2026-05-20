-- P1/P2: Team AF id column, zh name overrides, forced publish audit field
ALTER TABLE `Team`
  ADD COLUMN `apiFootballTeamId` INT NULL;

CREATE INDEX `Team_apiFootballTeamId_idx` ON `Team`(`apiFootballTeamId`);

ALTER TABLE `AiReport`
  ADD COLUMN `forcedPublish` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `forcedPublishReason` VARCHAR(500) NULL,
  ADD COLUMN `forcedPublishByUserId` VARCHAR(191) NULL;

CREATE TABLE `AfTeamNameOverride` (
  `id` VARCHAR(191) NOT NULL,
  `apiFootballTeamId` INT NOT NULL,
  `nameCn` VARCHAR(191) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AfTeamNameOverride_apiFootballTeamId_key`(`apiFootballTeamId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
