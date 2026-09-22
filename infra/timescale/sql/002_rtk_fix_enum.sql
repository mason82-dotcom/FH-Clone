-- Preserve DJI Cloud API RTK semantics:
-- position_state.is_fixed is a four-state enum, never a boolean.
ALTER TABLE telemetry
  ADD CONSTRAINT telemetry_is_fixed_enum_chk
  CHECK (is_fixed IS NULL OR is_fixed BETWEEN 0 AND 3)
  NOT VALID;

ALTER TABLE telemetry
  VALIDATE CONSTRAINT telemetry_is_fixed_enum_chk;
