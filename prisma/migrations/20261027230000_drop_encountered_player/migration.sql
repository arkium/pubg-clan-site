-- Fin d'EncounteredPlayer, étape 5 (docs/TODO/inventaire-2026-10-20.md §6) : la table n'est plus ni lue ni écrite
-- par le site depuis l'étape 4 (dernière écriture le 2026-10-23 à 03:22 UTC, vérifié le 2026-10-27). Ses données
-- vivent dans Player (identité, clan PUBG, compteurs) et ClanEncounter (rencontres par clan). Aucune table ne la
-- référence ; ses deux clés étrangères (vers Clan et Player) partent avec elle.
-- innodb_file_per_table = ON : le DROP efface son fichier, ~3,8 Go rendus au disque sans OPTIMIZE.
-- Définitif : une sauvegarde éventuelle se fait avant le déploiement.

-- DropTable
DROP TABLE `EncounteredPlayer`;
