package model

import "time"

// SessionEvent mirrors a row in the session_events table.
// Operational-class telemetry; PHI-free by construction.
// device_id and app_version are nullable: absent when client has not yet
// wired them (pre-11a.5) — stored as SQL NULL.
type SessionEvent struct {
	ID         string    `db:"id"`
	AccountID  string    `db:"account_id"`
	DeviceID   *string   `db:"device_id"`
	EventType  string    `db:"event_type"`
	AppVersion *string   `db:"app_version"`
	CreatedAt  time.Time `db:"created_at"`
}
