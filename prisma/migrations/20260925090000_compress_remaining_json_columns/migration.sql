-- Colonnes JSON compressées (gzip du JSON, ~7,3x mesuré le 2026-09-24).
--
-- ALGORITHM=INSTANT est explicite, et c'est volontaire : sans cette clause MariaDB *pourrait*
-- choisir une reconstruction, laquelle exigerait plus d'espace disque libre que le serveur n'en a.
-- Mieux vaut un échec immédiat qu'un disque saturé. L'algorithme a été vérifié sur cette instance
-- (scripts/check-compression-feasibility.ts).
--
-- `summary` reste volontairement en clair : cinq routes l'interrogent par JSON_EXTRACT
-- (telemetry/circles, heatmap, loot, vehicles), ce qu'un blob compressé rendrait impossible.
--
-- Les colonnes en clair restent en place : elles seront vidées par lots
-- (scripts/backfill-json-compression.ts) puis supprimées, également en INSTANT.
ALTER TABLE `SquadMatchTelemetry`
  ADD COLUMN `weaponStatsGz` LONGBLOB NULL,
  ADD COLUMN `memberStatsGz` LONGBLOB NULL,
  ADD COLUMN `deathSamplesGz` LONGBLOB NULL,
  ADD COLUMN `landingSamplesGz` LONGBLOB NULL,
  ADD COLUMN `phaseSnapshotsGz` LONGBLOB NULL,
  ADD COLUMN `killSamplesGz` LONGBLOB NULL,
  ADD COLUMN `shotSamplesGz` LONGBLOB NULL,
  ADD COLUMN `damageSamplesGz` LONGBLOB NULL,
  ADD COLUMN `knockoutSamplesGz` LONGBLOB NULL,
  ADD COLUMN `reviveSamplesGz` LONGBLOB NULL,
  ADD COLUMN `vehicleSamplesGz` LONGBLOB NULL,
  ADD COLUMN `killFeedSamplesGz` LONGBLOB NULL,
  ADD COLUMN `carePackageSamplesGz` LONGBLOB NULL,
  ALGORITHM=INSTANT;
