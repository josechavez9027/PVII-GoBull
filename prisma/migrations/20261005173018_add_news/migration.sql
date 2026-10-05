-- CreateTable
CREATE TABLE `NewsArticle` (
    `id` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(64) NOT NULL,
    `title` VARCHAR(512) NOT NULL,
    `description` TEXT NULL,
    `snippet` TEXT NULL,
    `url` VARCHAR(768) NOT NULL,
    `imageUrl` TEXT NULL,
    `source` VARCHAR(191) NOT NULL,
    `language` VARCHAR(8) NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL,
    `category` ENUM('MERCADOS', 'EMPRESAS', 'ECONOMIA', 'CRIPTO', 'DIVISAS', 'ENERGIA', 'TECNOLOGIA', 'SALUD', 'OTROS') NOT NULL DEFAULT 'OTROS',
    `sentiment` DOUBLE NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `favoriteCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NewsArticle_providerId_key`(`providerId`),
    UNIQUE INDEX `NewsArticle_url_key`(`url`),
    INDEX `NewsArticle_category_publishedAt_idx`(`category`, `publishedAt`),
    INDEX `NewsArticle_publishedAt_idx`(`publishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NewsArticleSymbol` (
    `id` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(32) NOT NULL,
    `matchScore` DOUBLE NULL,
    `sentiment` DOUBLE NULL,

    INDEX `NewsArticleSymbol_symbol_idx`(`symbol`),
    UNIQUE INDEX `NewsArticleSymbol_articleId_symbol_key`(`articleId`, `symbol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NewsProviderUsage` (
    `day` DATE NOT NULL,
    `requests` INTEGER NOT NULL DEFAULT 0,
    `symbolRequests` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NewsSyncState` (
    `job` VARCHAR(32) NOT NULL,
    `lastRunAt` DATETIME(3) NULL,
    `lastSuccessAt` DATETIME(3) NULL,
    `lastStatus` VARCHAR(32) NOT NULL DEFAULT 'NEVER',
    `lastError` TEXT NULL,
    `lastFetched` INTEGER NOT NULL DEFAULT 0,
    `lastCreated` INTEGER NOT NULL DEFAULT 0,
    `lastUpdated` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`job`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `NewsArticleSymbol` ADD CONSTRAINT `NewsArticleSymbol_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `NewsArticle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
