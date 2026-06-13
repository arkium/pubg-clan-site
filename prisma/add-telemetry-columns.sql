ALTER TABLE SquadMatchTelemetry
  ADD COLUMN killSamples JSON NULL,
  ADD COLUMN shotSamples JSON NULL,
  ADD COLUMN damageSamples JSON NULL,
  ADD COLUMN knockoutSamples JSON NULL,
  ADD COLUMN reviveSamples JSON NULL,
  ADD COLUMN vehicleSamples JSON NULL;
