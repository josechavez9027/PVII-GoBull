-- CreateTable
CREATE TABLE `FutureSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `asOf` DATETIME(3) NOT NULL,
    `close` DECIMAL(18, 6) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FutureSnapshot_code_asOf_idx`(`code`, `asOf`),
    UNIQUE INDEX `FutureSnapshot_code_asOf_key`(`code`, `asOf`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
