-- +goose Up
ALTER TABLE accounts DROP CONSTRAINT accounts_google_sub_key;
CREATE UNIQUE INDEX accounts_google_sub_active_key ON accounts (google_sub) WHERE status = 'active';

-- +goose Down
DROP INDEX accounts_google_sub_active_key;
ALTER TABLE accounts ADD CONSTRAINT accounts_google_sub_key UNIQUE (google_sub);
