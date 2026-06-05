-- AlterTable
ALTER TABLE `MemberTelemetryStats`
  ADD COLUMN `avgVehicleRideEvents` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `avgVehicleLeaveEvents` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `avgPositionEvents` DOUBLE NOT NULL DEFAULT 0;