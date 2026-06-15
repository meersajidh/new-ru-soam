package session

import (
	"context"

	"github.com/meersajidh/ru-soam/server/identity/internal/model"
)

// AccountStore is the account persistence the session handler needs.
// Consumer-defined (Go idiom); satisfied structurally by *store.Postgres.
type AccountStore interface {
	// UpsertByGoogleSub inserts an account for the given Google sub, or updates
	// the email if one already exists. Returns the current persisted account.
	UpsertByGoogleSub(ctx context.Context, googleSub, email string) (*model.Account, error)
}

// EventStore records operational session telemetry. Consumer-defined;
// satisfied structurally by *store.SessionEventPostgres. Recording is
// best-effort at the call site (logged + swallowed on error).
type EventStore interface {
	// Record inserts one session_events row. Empty deviceID/appVersion store
	// as SQL NULL.
	Record(ctx context.Context, accountID, deviceID, eventType, appVersion string) error
}

// Event-type constants for session telemetry — use instead of raw strings.
const (
	EventLogin   = "login"
	EventRefresh = "refresh"
	EventSignout = "signout"
)
