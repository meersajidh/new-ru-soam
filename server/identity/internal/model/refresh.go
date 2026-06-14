// Package model contains data transfer objects shared across internal packages.
package model

import "time"

// RefreshToken mirrors a row in the refresh_tokens table.
// token_hash is the SHA-256 (base64url) of the opaque raw token; the raw
// value is never persisted.
type RefreshToken struct {
	ID        string     `db:"id"`
	AccountID string     `db:"account_id"`
	TokenHash string     `db:"token_hash"`
	FamilyID  string     `db:"family_id"`
	ExpiresAt time.Time  `db:"expires_at"`
	UsedAt    *time.Time `db:"used_at"`
	RevokedAt *time.Time `db:"revoked_at"`
	CreatedAt time.Time  `db:"created_at"`
}
