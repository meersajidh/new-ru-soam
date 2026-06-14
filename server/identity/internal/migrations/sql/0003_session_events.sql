-- +goose Up

CREATE TABLE session_events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    device_id   UUID        NULL,
    event_type  TEXT        NOT NULL CHECK (event_type IN ('login', 'refresh', 'signout')),
    app_version TEXT        NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- account_id index powers per-account event queries
CREATE INDEX ON session_events (account_id);

-- +goose Down

DROP TABLE session_events;
