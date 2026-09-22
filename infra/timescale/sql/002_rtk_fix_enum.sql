-- Preserve DJI Cloud API RTK semantics:
-- position_state.is_fixed is a four-state enum, never a boolean.
--
-- Fresh installations receive a fully validated constraint directly from
-- 001_schema.sql before Timescale columnstore is enabled.
--
-- Existing hypertables may already have columnstore enabled. TimescaleDB does
-- not support VALIDATE CONSTRAINT on such hypertables, so the upgrade path
-- installs the CHECK as NOT VALID when missing. PostgreSQL still enforces a
-- NOT VALID CHECK for newly inserted/updated rows without scanning historical
-- chunks.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'telemetry_is_fixed_enum_chk'
      AND conrelid = 'telemetry'::regclass
  ) THEN
    ALTER TABLE telemetry
      ADD CONSTRAINT telemetry_is_fixed_enum_chk
      CHECK (is_fixed IS NULL OR is_fixed BETWEEN 0 AND 3)
      NOT VALID;
  END IF;
END
$$;
