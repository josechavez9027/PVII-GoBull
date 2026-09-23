-- CreateTable
CREATE TABLE `Instrument` (
    `id` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `market` VARCHAR(191) NOT NULL,
    `kind` ENUM('STOCK', 'ETF', 'OTHER') NOT NULL DEFAULT 'STOCK',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Instrument_symbol_key`(`symbol`),
    INDEX `Instrument_symbol_idx`(`symbol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
