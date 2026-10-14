-- CreateTable
CREATE TABLE `PushSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `endpoint` VARCHAR(500) NOT NULL,
    `p256dh` VARCHAR(255) NOT NULL,
    `auth` VARCHAR(255) NOT NULL,
    `userAgent` VARCHAR(512) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `PushSubscription_endpoint_key`(`endpoint`),
    INDEX `PushSubscription_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NewsNotification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `articleId` VARCHAR(36) NOT NULL,
    `score` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'FAILED', 'READ') NOT NULL DEFAULT 'PENDING',
    `sentAt` DATETIME(3) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NewsNotification_userId_createdAt_idx`(`userId`, `createdAt`),
    UNIQUE INDEX `NewsNotification_userId_articleId_key`(`userId`, `articleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserNewsSetting` (
    `userId` VARCHAR(36) NOT NULL,
    `pushEnabled` BOOLEAN NOT NULL DEFAULT true,
    `minScore` INTEGER NOT NULL DEFAULT 70,
    `maxPerDay` INTEGER NOT NULL DEFAULT 5,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PushSubscription` ADD CONSTRAINT `PushSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NewsNotification` ADD CONSTRAINT `NewsNotification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NewsNotification` ADD CONSTRAINT `NewsNotification_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `NewsArticle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserNewsSetting` ADD CONSTRAINT `UserNewsSetting_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
