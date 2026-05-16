-- AlterTable: API-Football canonical fixture snapshot + sync cursor on MatchFacts
ALTER TABLE `MatchFacts` ADD COLUMN `rawAfFixture` JSON NULL,
    ADD COLUMN `afLastSyncedAt` DATETIME(3) NULL;
