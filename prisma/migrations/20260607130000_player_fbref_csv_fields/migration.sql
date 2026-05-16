-- FBref CSV 上传解析后的可筛字段（明细仍在 Player.profile.fbref）
ALTER TABLE `Player`
  ADD COLUMN `fbrefStatsSyncedAt` DATETIME(3) NULL,
  ADD COLUMN `fbrefSeasonTag` VARCHAR(40) NULL,
  ADD COLUMN `fbrefMinutes` INT NULL;

CREATE INDEX `Player_fbrefSeasonTag_idx` ON `Player`(`fbrefSeasonTag`);
CREATE INDEX `Player_fbrefStatsSyncedAt_idx` ON `Player`(`fbrefStatsSyncedAt`);
