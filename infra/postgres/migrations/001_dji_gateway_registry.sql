-- FH-Clone DJI gateway registry
-- Stores only sanitized topology metadata. device_secret/nonce are forbidden.

CREATE TABLE IF NOT EXISTS dji_gateways (
    gateway_sn TEXT PRIMARY KEY,
    product_domain TEXT,
    product_type INTEGER NOT NULL,
    product_sub_type INTEGER NOT NULL,
    thing_version TEXT,
    observed_at TIMESTAMPTZ NOT NULL,
    persisted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dji_gateway_devices (
    device_sn TEXT PRIMARY KEY,
    gateway_sn TEXT NOT NULL REFERENCES dji_gateways(gateway_sn) ON DELETE CASCADE,
    device_index TEXT,
    product_domain TEXT,
    product_type INTEGER NOT NULL,
    product_sub_type INTEGER NOT NULL,
    thing_version TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    observed_at TIMESTAMPTZ NOT NULL,
    removed_at TIMESTAMPTZ,
    persisted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dji_gateway_devices_gateway_active_idx
    ON dji_gateway_devices (gateway_sn, active);

COMMENT ON TABLE dji_gateways IS
    'Sanitized DJI gateway inventory from update_topo; never stores device_secret or nonce.';

COMMENT ON TABLE dji_gateway_devices IS
    'Current/last known DJI gateway-to-sub-device mapping; runtime EMQX authorization still requires a fresh in-memory update_topo.';
