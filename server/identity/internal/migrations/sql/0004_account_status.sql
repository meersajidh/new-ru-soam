-- +goose Up

ALTER TABLE accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted'));
ALTER TABLE accounts ADD COLUMN deleted_at TIMESTAMPTZ NULL;

-- +goose Down

ALTER TABLE accounts DROP COLUMN deleted_at;
ALTER TABLE accounts DROP COLUMN status;
