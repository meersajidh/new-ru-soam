package session

import (
	"context"

	"github.com/meersajidh/ru-soam/server/identity/internal/model"
)

// AccountStore is the account persistence the session handler needs.
// Consumer-defined (Go idiom); satisfied structurally by *store.Postgres.
type AccountStore interface {
	// UpsertByGoogleSub inserts a new active account for the given Google sub when
	// no active row exists (first signup, or only deleted tombstones remain), or
	// updates the email on the existing active row (O475 reconnect path).
	// Deleted tombstones are never reactivated — re-signup creates a new account.
	// Returns the current persisted active account.
	UpsertByGoogleSub(ctx context.Context, googleSub, email string) (*model.Account, error)

	// MarkDeleted soft-deletes the account: sets status='deleted' + deleted_at=now().
	// Retains all other columns. Idempotent.
	MarkDeleted(ctx context.Context, accountID string) error
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
	EventLogin          = "login"
	EventRefresh        = "refresh"
	EventSignout        = "signout"
	EventAccountDeleted = "account_deleted"
)
