-- RealPeep MNR D1 Schema
-- Applied once: wrangler d1 execute realpeep-mnr-db --file=workers/mnr-schema.sql

CREATE TABLE IF NOT EXISTS payloads (
    ephemeral_key   TEXT PRIMARY KEY,
    device_id       TEXT NOT NULL,
    captured_keys   TEXT NOT NULL,   -- JSON array stored as text
    received_at     INTEGER NOT NULL  -- Unix ms
);

CREATE TABLE IF NOT EXISTS receipts (
    receipt_key     TEXT PRIMARY KEY, -- "{device_id}_{target_key}"
    device_id       TEXT NOT NULL,
    target_key      TEXT NOT NULL,
    signature       TEXT NOT NULL,
    received_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS certificates (
    certificate_id  TEXT PRIMARY KEY,
    key_a           TEXT NOT NULL,
    key_b           TEXT NOT NULL,
    issued_at       INTEGER NOT NULL
);
