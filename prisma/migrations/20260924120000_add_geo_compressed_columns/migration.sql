-- Colonnes de géolocalisation compressées (gzip du JSON, ~8x mesuré le 2026-09-24).
--
-- ALGORITHM=INSTANT est explicite, et c'est volontaire : sans cette clause MariaDB *pourrait*
-- choisir une reconstruction, laquelle exigerait ~22 Go d'espace disque libre sur un serveur qui
-- n'en a qu'une dizaine. Mieux vaut un échec immédiat qu'un disque saturé. L'algorithme a été
-- vérifié sur cette instance (scripts/check-compression-feasibility.ts) : ADD COLUMN et
-- DROP COLUMN sont tous deux acceptés en INSTANT.
--
-- Les colonnes en clair `positionSamples` / `trajectorySegments` restent en place : elles seront
-- vidées par lots (scripts/backfill-geo-compression.ts) puis supprimées, également en INSTANT.
ALTER TABLE `SquadMatchTelemetry`
  ADD COLUMN `positionSamplesGz` LONGBLOB NULL,
  ADD COLUMN `trajectorySegmentsGz` LONGBLOB NULL,
  ALGORITHM=INSTANT;
