-- AlterTable
ALTER TABLE `SquadMatchTelemetry`
    ADD COLUMN `positionSamples` JSON NULL,
    ADD COLUMN `trajectorySegments` JSON NULL,
    ADD COLUMN `deathSamples` JSON NULL;
