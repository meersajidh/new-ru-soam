package service

import (
	"context"
	"time"

	"github.com/meersajidh/ru-soam/server/identity/internal/model"
)

// RefreshTokenStore is the persistence behaviour TokenService needs for refresh
// token rotation. Declared here in the consumer package per the Go
// consumer-defined interface idiom; satisfied structurally by
// *store.RefreshPostgres (and by test fakes). All methods must be safe for
// concurrent use.
type RefreshTokenStore interface {
	// CreateToken inserts a new refresh token row. tokenHash is the SHA-256
	// (base64url) of the raw token; the raw value must never be passed here.
	CreateToken(ctx context.Context, accountID, tokenHash, familyID string, expiresAt time.Time) error

	// GetByHash retrieves the refresh token whose token_hash matches.
	// Returns nil, nil when not found (not an error).
	GetByHash(ctx context.Context, tokenHash string) (*model.RefreshToken, error)

	// MarkUsed sets used_at = now() on the token with the given id.
	MarkUsed(ctx context.Context, id string) error

	// RevokeFamily sets revoked_at = now() on ALL tokens sharing familyID.
	RevokeFamily(ctx context.Context, familyID string) error
}
