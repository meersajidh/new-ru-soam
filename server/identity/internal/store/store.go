// Package store defines the persistence interfaces for the identity service.
package store

import (
	"context"
	"time"

	"github.com/meersajidh/ru-soam/server/identity/internal/model"
)

// AccountStore is the persistence interface for accounts.
// Implementations must be safe for concurrent use.
type AccountStore interface {
	// UpsertByGoogleSub inserts an account for the given Google sub, or updates
	// the email if one already exists (email refreshed on re-login).
	// Returns the current persisted account.
	UpsertByGoogleSub(ctx context.Context, googleSub, email string) (*model.Account, error)

	// GetByGoogleSub retrieves an account by its stable Google subject identifier.
	// Returns nil, nil when not found.
	GetByGoogleSub(ctx context.Context, googleSub string) (*model.Account, error)

	// Ping checks that the store is reachable. Used by the readiness probe.
	Ping(ctx context.Context) error
}

// Event-type constants for session telemetry.
// Use these instead of raw strings to avoid typos.
const (
	EventLogin   = "login"
	EventRefresh = "refresh"
	EventSignout = "signout"
)

// EventStore is the persistence interface for operational session telemetry.
// Implementations must be safe for concurrent use.
type EventStore interface {
	// Record inserts one session_events row.
	// Empty strings for deviceID and appVersion are stored as SQL NULL.
	// Best-effort: callers should log and continue on error.
	Record(ctx context.Context, accountID, deviceID, eventType, appVersion string) error
}

// RefreshTokenStore is the persistence interface for refresh token rotation.
// All methods must be safe for concurrent use.
type RefreshTokenStore interface {
	// CreateToken inserts a new refresh token row.
	// tokenHash is the SHA-256 (base64url) of the raw token; the raw value must
	// never be passed here.
	CreateToken(ctx context.Context, accountID, tokenHash, familyID string, expiresAt time.Time) error

	// GetByHash retrieves the refresh token whose token_hash matches.
	// Returns nil, nil when not found (not an error).
	GetByHash(ctx context.Context, tokenHash string) (*model.RefreshToken, error)

	// MarkUsed sets used_at = now() on the token with the given id.
	// Called during rotation before inserting the successor token.
	MarkUsed(ctx context.Context, id string) error

	// RevokeFamily sets revoked_at = now() on ALL tokens sharing familyID.
	// Called on explicit revoke and on reuse-detection.
	RevokeFamily(ctx context.Context, familyID string) error
}
