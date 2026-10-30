-- CreateTable
CREATE TABLE `Indicator` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('VOLATILITY', 'DOLLAR', 'RATES', 'EQUITY', 'COMMODITY', 'CRYPTO', 'FOREX', 'MACRO') NOT NULL,
    `unit` VARCHAR(16) NOT NULL DEFAULT 'index',
    `decimals` INTEGER NOT NULL DEFAULT 2,
    `source` VARCHAR(24) NOT NULL DEFAULT 'FMP_QUOTE',
    `sourceSymbol` VARCHAR(64) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Indicator_code_key`(`code`),
    INDEX `Indicator_category_sortOrder_idx`(`category`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IndicatorSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `indicatorId` VARCHAR(191) NOT NULL,
    `asOf` DATETIME(3) NOT NULL,
    `value` DECIMAL(18, 6) NOT NULL,
    `changePct` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IndicatorSnapshot_indicatorId_asOf_idx`(`indicatorId`, `asOf`),
    UNIQUE INDEX `IndicatorSnapshot_indicatorId_asOf_key`(`indicatorId`, `asOf`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IndicatorSyncState` (
    `job` VARCHAR(32) NOT NULL,
    `lastRunAt` DATETIME(3) NULL,
    `lastSuccessAt` DATETIME(3) NULL,
    `lastStatus` VARCHAR(32) NOT NULL DEFAULT 'NEVER',
    `lastError` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`job`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IndicatorProviderUsage` (
    `day` DATE NOT NULL,
    `requests` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `IndicatorSnapshot` ADD CONSTRAINT `IndicatorSnapshot_indicatorId_fkey` FOREIGN KEY (`indicatorId`) REFERENCES `Indicator`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
