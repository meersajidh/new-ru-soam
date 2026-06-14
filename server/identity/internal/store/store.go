// Package store defines the persistence interfaces for the identity service.
package store

import (
	"context"

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
