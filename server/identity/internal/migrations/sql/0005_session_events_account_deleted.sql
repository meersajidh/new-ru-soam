-- +goose Up

ALTER TABLE session_events DROP CONSTRAINT session_events_event_type_check;
ALTER TABLE session_events ADD CONSTRAINT session_events_event_type_check
    CHECK (event_type IN ('login', 'refresh', 'signout', 'account_deleted'));

-- +goose Down

ALTER TABLE session_events DROP CONSTRAINT session_events_event_type_check;
ALTER TABLE session_events ADD CONSTRAINT session_events_event_type_check
    CHECK (event_type IN ('login', 'refresh', 'signout'));
