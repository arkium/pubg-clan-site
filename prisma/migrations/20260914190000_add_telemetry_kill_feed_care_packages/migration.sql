-- AlterTable
-- Additif uniquement : deux colonnes JSON nullables, aucune donnée existante modifiée.
-- killFeedSamples : kill-feed complet du lobby (KillEvent n'en garde que les frags des clans synchronisés).
-- carePackageSamples : caisses de largage, sorties de `summary` pour ne pas alourdir les JSON_EXTRACT des agrégats.
-- ALGORITHM=INSTANT : la table dépasse 12 Go en production ; sans ajout instantané, MariaDB
-- recopierait toute la table sous verrou. Si l'ajout instantané est impossible, l'instruction
-- échoue immédiatement sans rien modifier.
ALTER TABLE `SquadMatchTelemetry` ADD COLUMN `carePackageSamples` JSON NULL,
    ADD COLUMN `killFeedSamples` JSON NULL,
    ALGORITHM=INSTANT;
