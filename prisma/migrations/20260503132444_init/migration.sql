-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `openid` VARCHAR(191) NOT NULL,
    `unionid` VARCHAR(191) NULL,
    `nickname` VARCHAR(191) NULL,
    `avatarUrl` VARCHAR(191) NULL,
    `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_openid_key`(`openid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tournament` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `nameCn` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `type` ENUM('DOMESTIC_LEAGUE', 'DOMESTIC_CUP', 'CONTINENTAL_CLUB', 'CONTINENTAL_NATIONAL', 'GLOBAL_NATIONAL', 'GLOBAL_CLUB', 'FRIENDLY', 'OTHER') NOT NULL,
    `level` ENUM('TIER_1', 'TIER_2', 'TIER_3', 'CUP', 'INTERNATIONAL', 'OTHER') NOT NULL DEFAULT 'TIER_1',
    `region` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `organizer` VARCHAR(191) NULL,
    `isGlobal` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Tournament_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Season` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `year` INTEGER NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `isCurrent` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Season_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Competition` (
    `id` VARCHAR(191) NOT NULL,
    `tournamentId` VARCHAR(191) NULL,
    `seasonId` VARCHAR(191) NULL,
    `externalId` VARCHAR(191) NULL,
    `code` VARCHAR(191) NULL,
    `nameCn` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NULL,
    `seasonName` VARCHAR(191) NULL,
    `currentMatchday` INTEGER NULL,
    `level` ENUM('TIER_1', 'TIER_2', 'TIER_3', 'CUP', 'INTERNATIONAL', 'OTHER') NOT NULL DEFAULT 'TIER_1',
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Competition_externalId_key`(`externalId`),
    INDEX `Competition_tournamentId_seasonId_idx`(`tournamentId`, `seasonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataProviderMapping` (
    `id` VARCHAR(191) NOT NULL,
    `provider` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL,
    `tournamentId` VARCHAR(191) NULL,
    `competitionId` VARCHAR(191) NULL,
    `providerCompetitionCode` VARCHAR(191) NULL,
    `providerCompetitionId` VARCHAR(191) NULL,
    `providerSeasonCode` VARCHAR(191) NULL,
    `extra` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DataProviderMapping_provider_providerCompetitionCode_idx`(`provider`, `providerCompetitionCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Team` (
    `id` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NULL,
    `nameCn` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `shortName` VARCHAR(191) NULL,
    `logoUrl` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `founded` INTEGER NULL,
    `venue` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `eloRating` INTEGER NOT NULL DEFAULT 1500,
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Team_externalId_key`(`externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Player` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NULL,
    `nameCn` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NULL,
    `nationality` VARCHAR(191) NULL,
    `shirtNumber` INTEGER NULL,
    `fantasyPrice` DOUBLE NULL,
    `fantasySource` VARCHAR(191) NULL,
    `status` VARCHAR(191) NULL,
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Player_teamId_idx`(`teamId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Match` (
    `id` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NULL,
    `competitionId` VARCHAR(191) NOT NULL,
    `tournamentId` VARCHAR(191) NULL,
    `seasonId` VARCHAR(191) NULL,
    `round` VARCHAR(191) NULL,
    `stage` VARCHAR(191) NULL,
    `groupName` VARCHAR(191) NULL,
    `homeTeamId` VARCHAR(191) NOT NULL,
    `awayTeamId` VARCHAR(191) NOT NULL,
    `stadium` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `kickoffTime` DATETIME(3) NOT NULL,
    `status` ENUM('SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED', 'UNKNOWN') NOT NULL DEFAULT 'SCHEDULED',
    `homeScore` INTEGER NULL,
    `awayScore` INTEGER NULL,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `reportStatus` ENUM('NONE', 'DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'NONE',
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Match_externalId_key`(`externalId`),
    INDEX `Match_kickoffTime_idx`(`kickoffTime`),
    INDEX `Match_isFeatured_idx`(`isFeatured`),
    INDEX `Match_tournamentId_idx`(`tournamentId`),
    INDEX `Match_competitionId_idx`(`competitionId`),
    INDEX `Match_seasonId_idx`(`seasonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeamMatchSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `isHome` BOOLEAN NOT NULL,
    `leagueRank` INTEGER NULL,
    `points` INTEGER NULL,
    `recentForm` VARCHAR(191) NULL,
    `goalsForAvg` DOUBLE NULL,
    `goalsAgainstAvg` DOUBLE NULL,
    `xgAvg` DOUBLE NULL,
    `xgaAvg` DOUBLE NULL,
    `attackRating` DOUBLE NOT NULL DEFAULT 50,
    `defenseRating` DOUBLE NOT NULL DEFAULT 50,
    `injuryImpact` DOUBLE NOT NULL DEFAULT 0,
    `fatigueIndex` DOUBLE NOT NULL DEFAULT 0,
    `formation` VARCHAR(191) NULL,
    `coachName` VARCHAR(191) NULL,
    `coachStyle` VARCHAR(191) NULL,
    `possessionAvg` DOUBLE NULL,
    `attackStyle` VARCHAR(191) NULL,
    `defensiveWeakness` VARCHAR(191) NULL,
    `tacticalTags` JSON NULL,
    `notes` TEXT NULL,
    `dataQuality` ENUM('PUBLIC_DATA', 'MANUAL_INPUT', 'MODEL_ESTIMATED', 'AI_GENERATED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TeamMatchSnapshot_matchId_teamId_key`(`matchId`, `teamId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlayerMatchSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `last5Goals` INTEGER NULL,
    `last5Assists` INTEGER NULL,
    `last5Minutes` INTEGER NULL,
    `avgMinutes` DOUBLE NULL,
    `isNationalTeamDuty` BOOLEAN NOT NULL DEFAULT false,
    `consecutiveStarts` INTEGER NULL,
    `expectedStartProbability` DOUBLE NULL,
    `fitnessScore` DOUBLE NULL,
    `formScore` DOUBLE NULL,
    `riskLevel` ENUM('LOW', 'MEDIUM', 'MEDIUM_HIGH', 'HIGH', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `injuryNews` TEXT NULL,
    `injuryNote` TEXT NULL,
    `recentStatsText` TEXT NULL,
    `matchupText` TEXT NULL,
    `sentimentText` TEXT NULL,
    `fantasyPrice` DOUBLE NULL,
    `predictedFantasyPoints` DOUBLE NULL,
    `notes` TEXT NULL,
    `dataQuality` ENUM('PUBLIC_DATA', 'MANUAL_INPUT', 'MODEL_ESTIMATED', 'AI_GENERATED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlayerMatchSnapshot_matchId_playerId_key`(`matchId`, `playerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Referee` (
    `id` VARCHAR(191) NOT NULL,
    `nameCn` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefereeSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `refereeId` VARCHAR(191) NOT NULL,
    `matchesCount` INTEGER NULL,
    `yellowCardsAvg` DOUBLE NULL,
    `redCardsAvg` DOUBLE NULL,
    `penaltiesAvg` DOUBLE NULL,
    `foulsAvg` DOUBLE NULL,
    `homeWinRate` DOUBLE NULL,
    `addedTimeAvg` DOUBLE NULL,
    `notes` TEXT NULL,
    `dataQuality` ENUM('PUBLIC_DATA', 'MANUAL_INPUT', 'MODEL_ESTIMATED', 'AI_GENERATED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RefereeSnapshot_matchId_key`(`matchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WeatherSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `temperature` DOUBLE NULL,
    `condition` VARCHAR(191) NULL,
    `humidity` DOUBLE NULL,
    `windSpeed` DOUBLE NULL,
    `visibility` DOUBLE NULL,
    `pitchCondition` VARCHAR(191) NULL,
    `source` VARCHAR(191) NULL,
    `weatherImpactScore` DOUBLE NOT NULL DEFAULT 0,
    `dataQuality` ENUM('PUBLIC_DATA', 'MANUAL_INPUT', 'MODEL_ESTIMATED', 'AI_GENERATED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'QWEATHER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WeatherSnapshot_matchId_key`(`matchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MatchPrediction` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `homeWinProbability` INTEGER NOT NULL,
    `drawProbability` INTEGER NOT NULL,
    `awayWinProbability` INTEGER NOT NULL,
    `homeExpectedGoals` DOUBLE NOT NULL,
    `awayExpectedGoals` DOUBLE NOT NULL,
    `totalExpectedGoals` DOUBLE NOT NULL,
    `totalGoalsTrend` VARCHAR(191) NULL,
    `tempoIndex` INTEGER NOT NULL,
    `upsetIndex` INTEGER NOT NULL,
    `confidence` INTEGER NOT NULL,
    `modelVersion` VARCHAR(191) NOT NULL,
    `factorBreakdown` JSON NULL,
    `explanation` TEXT NULL,
    `dataQuality` ENUM('PUBLIC_DATA', 'MANUAL_INPUT', 'MODEL_ESTIMATED', 'AI_GENERATED', 'UNKNOWN') NOT NULL DEFAULT 'MODEL_ESTIMATED',
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'MODEL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MatchPrediction_matchId_key`(`matchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlayerIntelligence` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `statusTag` VARCHAR(191) NOT NULL,
    `startProbability` INTEGER NOT NULL,
    `riskLevel` ENUM('LOW', 'MEDIUM', 'MEDIUM_HIGH', 'HIGH', 'UNKNOWN') NOT NULL,
    `fitnessAnalysis` TEXT NULL,
    `psychologyAnalysis` TEXT NULL,
    `matchupAnalysis` TEXT NULL,
    `weatherImpact` TEXT NULL,
    `fantasySuggestion` TEXT NULL,
    `aiSummary` TEXT NULL,
    `rawInput` JSON NULL,
    `rawOutput` JSON NULL,
    `dataQuality` ENUM('PUBLIC_DATA', 'MANUAL_INPUT', 'MODEL_ESTIMATED', 'AI_GENERATED', 'UNKNOWN') NOT NULL DEFAULT 'AI_GENERATED',
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'DEEPSEEK',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlayerIntelligence_matchId_playerId_key`(`matchId`, `playerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TacticalScenario` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `scenarioType` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `probability` INTEGER NOT NULL,
    `precondition` TEXT NOT NULL,
    `process` TEXT NOT NULL,
    `possibleScore` VARCHAR(191) NULL,
    `timeline` TEXT NULL,
    `keyPlayers` JSON NULL,
    `riskPoints` JSON NULL,
    `rawInput` JSON NULL,
    `rawOutput` JSON NULL,
    `dataQuality` ENUM('PUBLIC_DATA', 'MANUAL_INPUT', 'MODEL_ESTIMATED', 'AI_GENERATED', 'UNKNOWN') NOT NULL DEFAULT 'AI_GENERATED',
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'DEEPSEEK',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FantasyAdvice` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `mustHave` JSON NULL,
    `valuePicks` JSON NULL,
    `avoid` JSON NULL,
    `captainRecommendation` TEXT NULL,
    `predictedPoints` JSON NULL,
    `riskWarnings` JSON NULL,
    `priceSource` VARCHAR(191) NULL,
    `rawInput` JSON NULL,
    `rawOutput` JSON NULL,
    `dataQuality` ENUM('PUBLIC_DATA', 'MANUAL_INPUT', 'MODEL_ESTIMATED', 'AI_GENERATED', 'UNKNOWN') NOT NULL DEFAULT 'AI_GENERATED',
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'DEEPSEEK',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FantasyAdvice_matchId_key`(`matchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HeadToHeadInsight` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `lastMeetingsCount` INTEGER NULL,
    `homeWins` INTEGER NULL,
    `draws` INTEGER NULL,
    `awayWins` INTEGER NULL,
    `avgGoals` DOUBLE NULL,
    `homeAdvantageText` TEXT NULL,
    `cardsText` TEXT NULL,
    `cornersText` TEXT NULL,
    `summary` TEXT NULL,
    `rawStats` JSON NULL,
    `missingFields` JSON NULL,
    `dataQuality` ENUM('PUBLIC_DATA', 'MANUAL_INPUT', 'MODEL_ESTIMATED', 'AI_GENERATED', 'UNKNOWN') NOT NULL DEFAULT 'PUBLIC_DATA',
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HeadToHeadInsight_matchId_key`(`matchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialGuide` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `oneLiner` VARCHAR(191) NOT NULL,
    `keyMoments` JSON NULL,
    `shareCopy` TEXT NULL,
    `posterTitle` VARCHAR(191) NULL,
    `shortVideoScript` TEXT NULL,
    `momentsCopy` TEXT NULL,
    `xiaohongshuTitle` VARCHAR(191) NULL,
    `rawInput` JSON NULL,
    `rawOutput` JSON NULL,
    `dataQuality` ENUM('PUBLIC_DATA', 'MANUAL_INPUT', 'MODEL_ESTIMATED', 'AI_GENERATED', 'UNKNOWN') NOT NULL DEFAULT 'AI_GENERATED',
    `dataSource` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL DEFAULT 'DEEPSEEK',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SocialGuide_matchId_key`(`matchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiReport` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `freeSummary` TEXT NOT NULL,
    `dashboardSummary` TEXT NULL,
    `refereeAnalysis` JSON NULL,
    `weatherAnalysis` JSON NULL,
    `playerProfiles` JSON NULL,
    `tacticalScenarios` JSON NULL,
    `fantasyAdvice` JSON NULL,
    `historicalInsight` TEXT NULL,
    `headToHeadInsight` JSON NULL,
    `expertVariables` JSON NULL,
    `socialGuide` JSON NULL,
    `sourceSummary` JSON NULL,
    `disclaimer` TEXT NOT NULL,
    `modelName` VARCHAR(191) NULL,
    `status` ENUM('NONE', 'DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `rawInput` JSON NULL,
    `rawOutput` JSON NULL,
    `contentWarnings` JSON NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AiReport_matchId_status_idx`(`matchId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `orderNo` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'CNY',
    `status` ENUM('CREATED', 'PAYING', 'PAID', 'CLOSED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'CREATED',
    `provider` ENUM('WECHAT') NOT NULL DEFAULT 'WECHAT',
    `wxPrepayId` VARCHAR(191) NULL,
    `wxTransactionId` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `notifyRaw` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Order_orderNo_key`(`orderNo`),
    INDEX `Order_userId_matchId_idx`(`userId`, `matchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentUnlock` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `amount` INTEGER NOT NULL,
    `status` ENUM('CREATED', 'PAYING', 'PAID', 'CLOSED', 'FAILED', 'REFUNDED') NOT NULL,
    `provider` ENUM('WECHAT') NOT NULL,
    `transactionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PaymentUnlock_userId_matchId_idx`(`userId`, `matchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SourceRecord` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `sourceType` ENUM('FOOTBALL_DATA', 'DEEPSEEK', 'QWEATHER', 'WIKIPEDIA', 'FIFA', 'UEFA', 'FPL', 'KAGGLE', 'ESPN', 'WORLDFOOTBALL', 'ELEVEN_V_ELEVEN', 'TRANSFERMARKT', 'MANUAL', 'MODEL', 'UNKNOWN') NOT NULL,
    `sourceName` VARCHAR(191) NOT NULL,
    `sourceUrl` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `content` TEXT NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dataQuality` ENUM('PUBLIC_DATA', 'MANUAL_INPUT', 'MODEL_ESTIMATED', 'AI_GENERATED', 'UNKNOWN') NOT NULL DEFAULT 'PUBLIC_DATA',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SourceRecord_matchId_sourceType_idx`(`matchId`, `sourceType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApiLog` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NULL,
    `statusCode` INTEGER NULL,
    `success` BOOLEAN NOT NULL,
    `message` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Competition` ADD CONSTRAINT `Competition_tournamentId_fkey` FOREIGN KEY (`tournamentId`) REFERENCES `Tournament`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Competition` ADD CONSTRAINT `Competition_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataProviderMapping` ADD CONSTRAINT `DataProviderMapping_tournamentId_fkey` FOREIGN KEY (`tournamentId`) REFERENCES `Tournament`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataProviderMapping` ADD CONSTRAINT `DataProviderMapping_competitionId_fkey` FOREIGN KEY (`competitionId`) REFERENCES `Competition`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Player` ADD CONSTRAINT `Player_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_competitionId_fkey` FOREIGN KEY (`competitionId`) REFERENCES `Competition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_tournamentId_fkey` FOREIGN KEY (`tournamentId`) REFERENCES `Tournament`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_homeTeamId_fkey` FOREIGN KEY (`homeTeamId`) REFERENCES `Team`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_awayTeamId_fkey` FOREIGN KEY (`awayTeamId`) REFERENCES `Team`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMatchSnapshot` ADD CONSTRAINT `TeamMatchSnapshot_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMatchSnapshot` ADD CONSTRAINT `TeamMatchSnapshot_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerMatchSnapshot` ADD CONSTRAINT `PlayerMatchSnapshot_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerMatchSnapshot` ADD CONSTRAINT `PlayerMatchSnapshot_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerMatchSnapshot` ADD CONSTRAINT `PlayerMatchSnapshot_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefereeSnapshot` ADD CONSTRAINT `RefereeSnapshot_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefereeSnapshot` ADD CONSTRAINT `RefereeSnapshot_refereeId_fkey` FOREIGN KEY (`refereeId`) REFERENCES `Referee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WeatherSnapshot` ADD CONSTRAINT `WeatherSnapshot_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MatchPrediction` ADD CONSTRAINT `MatchPrediction_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerIntelligence` ADD CONSTRAINT `PlayerIntelligence_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerIntelligence` ADD CONSTRAINT `PlayerIntelligence_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerIntelligence` ADD CONSTRAINT `PlayerIntelligence_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TacticalScenario` ADD CONSTRAINT `TacticalScenario_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FantasyAdvice` ADD CONSTRAINT `FantasyAdvice_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HeadToHeadInsight` ADD CONSTRAINT `HeadToHeadInsight_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialGuide` ADD CONSTRAINT `SocialGuide_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiReport` ADD CONSTRAINT `AiReport_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentUnlock` ADD CONSTRAINT `PaymentUnlock_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentUnlock` ADD CONSTRAINT `PaymentUnlock_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentUnlock` ADD CONSTRAINT `PaymentUnlock_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SourceRecord` ADD CONSTRAINT `SourceRecord_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
