-- +goose Up

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE accounts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub  TEXT        UNIQUE NOT NULL,
    email       TEXT        NOT NULL,
    entity_id   UUID        NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down

DROP TABLE accounts;
