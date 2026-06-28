-- CreateTable
CREATE TABLE `NavItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `navKey` VARCHAR(191) NOT NULL,
    `section` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `hrefTemplate` VARCHAR(191) NOT NULL,
    `defaultRole` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `sectionOverride` VARCHAR(191) NULL,
    `roleOverride` VARCHAR(191) NULL,
    `labelOverride` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NavItem_navKey_key`(`navKey`),
    INDEX `NavItem_section_sortOrder_idx`(`section`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
