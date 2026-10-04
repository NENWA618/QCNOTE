-- Create user_vault_keys table for local-database encryption (qcruntime KEK/DEK scheme)
-- Run this migration on your PostgreSQL database
--
-- wrapped_key holds each user's per-user Key Encryption Key (KEK), encrypted at
-- rest with the server's VAULT_MASTER_KEY. The client uses the KEK to wrap/unwrap
-- its own locally-generated Data Encryption Key (DEK); the DEK itself never
-- leaves the browser, so this table alone (plus a Postgres dump) is not enough
-- to decrypt any user's notes.

CREATE TABLE IF NOT EXISTS user_vault_keys (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  wrapped_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
