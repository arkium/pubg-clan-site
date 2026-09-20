-- Chantier 0 du cycle de vie de clan (docs/TODO/todo.md, section P2).
-- Marque les clans techniques du site (ex. "Ungrouped" / UNG) pour qu'ils ne
-- puissent plus etre renommes ni absorbes par un clan PUBG.
-- Migration purement additive : ADD COLUMN avec valeur par defaut, aucun
-- backfill necessaire (tous les clans existants sont des clans reels).
ALTER TABLE `Clan` ADD COLUMN `isSystem` BOOLEAN NOT NULL DEFAULT false;
