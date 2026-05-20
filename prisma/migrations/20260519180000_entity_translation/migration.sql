-- EntityTranslation + localization cache columns

CREATE TABLE `EntityTranslation` (
    `id` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `externalSource` VARCHAR(32) NULL,
    `externalId` VARCHAR(64) NULL,
    `locale` VARCHAR(16) NOT NULL DEFAULT 'zh-CN',
    `field` VARCHAR(32) NOT NULL DEFAULT 'name',
    `sourceText` VARCHAR(191) NULL,
    `translatedText` VARCHAR(191) NOT NULL,
    `shortText` VARCHAR(191) NULL,
    `aliasJson` JSON NULL,
    `metadataJson` JSON NULL,
    `source` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `confidence` DOUBLE NULL,
    `locked` BOOLEAN NOT NULL DEFAULT false,
    `updatedBy` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `et_ext_locale_field_uq`(`entityType`, `externalId`, `locale`, `field`),
    INDEX `EntityTranslation_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `EntityTranslation_status_source_idx`(`status`, `source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Competition` ADD COLUMN `shortNameCn` VARCHAR(191) NULL;
ALTER TABLE `Team` ADD COLUMN `shortNameCn` VARCHAR(191) NULL;
ALTER TABLE `Player` ADD COLUMN `shortNameCn` VARCHAR(191) NULL;
ALTER TABLE `Match` ADD COLUMN `cityCn` VARCHAR(191) NULL;
ALTER TABLE `Match` ADD COLUMN `venueNameCn` VARCHAR(191) NULL;
