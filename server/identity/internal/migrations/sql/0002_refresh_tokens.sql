-- +goose Up

CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    token_hash  TEXT        UNIQUE NOT NULL,
    family_id   UUID        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ NULL,
    revoked_at  TIMESTAMPTZ NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- family_id index powers RevokeFamily (UPDATE WHERE family_id = $1)
CREATE INDEX ON refresh_tokens (family_id);

-- +goose Down

DROP TABLE refresh_tokens;
