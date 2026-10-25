-- Coach IA, lots 10 et 11 (docs/TODO/coach-ia-pistes.md §6, docs/TODO/chatbot-ia.md §13) : règles apprises écrites par le
-- SuperUser (bloc « Règles du site » du prompt, bornées à 20 actives) et mémoire personnelle par compte (8 lignes au plus,
-- 90 jours, visible et effaçable par le joueur, jamais lue par le SuperUser). Additive : deux tables vides, aucune donnée
-- touchée ; les deux fonctions restent fermées (coach_rules_enabled, coach_memory_enabled) tant que le SuperUser ne les
-- ouvre pas depuis /settings/coach.

-- CreateTable
CREATE TABLE `CoachRule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `text` VARCHAR(200) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `fromMessageId` INTEGER NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CoachRule_enabled_createdAt_idx`(`enabled`, `createdAt`),
    INDEX `CoachRule_fromMessageId_idx`(`fromMessageId`),
    INDEX `CoachRule_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CoachMemory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `memberId` INTEGER NULL,
    `clanId` INTEGER NULL,
    `key` VARCHAR(32) NOT NULL,
    `text` VARCHAR(200) NOT NULL,
    `baseline` JSON NULL,
    `source` VARCHAR(16) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `CoachMemory_userId_updatedAt_idx`(`userId`, `updatedAt`),
    INDEX `CoachMemory_expiresAt_idx`(`expiresAt`),
    INDEX `CoachMemory_memberId_idx`(`memberId`),
    INDEX `CoachMemory_clanId_idx`(`clanId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CoachRule` ADD CONSTRAINT `CoachRule_fromMessageId_fkey` FOREIGN KEY (`fromMessageId`) REFERENCES `CoachMessage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachRule` ADD CONSTRAINT `CoachRule_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `UserAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachMemory` ADD CONSTRAINT `CoachMemory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachMemory` ADD CONSTRAINT `CoachMemory_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachMemory` ADD CONSTRAINT `CoachMemory_clanId_fkey` FOREIGN KEY (`clanId`) REFERENCES `Clan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

