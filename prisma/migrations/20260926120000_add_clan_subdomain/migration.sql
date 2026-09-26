-- Sous-domaine par clan (docs/TODO/chickendinnerfr.md §4.A).
-- Migration purement additive : une colonne nullable et son index unique (plusieurs NULL
-- sont admis par MariaDB). Le remplissage des clans actifs est fait a part, par
-- scripts/backfill-clan-subdomains.ts (simulation d'abord).
ALTER TABLE `Clan` ADD COLUMN `subdomain` VARCHAR(63) NULL;

CREATE UNIQUE INDEX `Clan_subdomain_key` ON `Clan`(`subdomain`);
