-- Coach IA (docs/TODO/chatbot-ia.md §4.1) : fils de conversation, messages et lignes d'usage (quota et budget).
-- Additive : trois tables vides, aucune donnée touchée. Les fils suivent le compte (cascade) ; membre et clan sont
-- facultatifs et mis à null si la ligne référencée disparaît. CoachUsage n'a volontairement aucune clé étrangère.

-- CreateTable
CREATE TABLE `CoachConversation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `memberId` INTEGER NULL,
    `clanId` INTEGER NULL,
    `title` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CoachConversation_userId_updatedAt_idx`(`userId`, `updatedAt`),
    INDEX `CoachConversation_memberId_idx`(`memberId`),
    INDEX `CoachConversation_clanId_idx`(`clanId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CoachMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversationId` INTEGER NOT NULL,
    `role` VARCHAR(16) NOT NULL,
    `content` TEXT NOT NULL,
    `contextPath` VARCHAR(191) NULL,
    `toolCalls` JSON NULL,
    `unverified` BOOLEAN NOT NULL DEFAULT false,
    `feedbackScore` INTEGER NULL,
    `feedbackNote` VARCHAR(280) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CoachMessage_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    INDEX `CoachMessage_feedbackScore_reviewedAt_idx`(`feedbackScore`, `reviewedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CoachUsage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `clanId` INTEGER NULL,
    `conversationId` INTEGER NULL,
    `model` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `tokensIn` INTEGER NOT NULL DEFAULT 0,
    `tokensOut` INTEGER NOT NULL DEFAULT 0,
    `costMicroUsd` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CoachUsage_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `CoachUsage_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CoachConversation` ADD CONSTRAINT `CoachConversation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachConversation` ADD CONSTRAINT `CoachConversation_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachConversation` ADD CONSTRAINT `CoachConversation_clanId_fkey` FOREIGN KEY (`clanId`) REFERENCES `Clan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachMessage` ADD CONSTRAINT `CoachMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `CoachConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

