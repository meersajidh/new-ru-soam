package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/meersajidh/ru-soam/server/identity/internal/model"
)

// RefreshPostgres implements RefreshTokenStore using a pgx/v5 connection pool.
type RefreshPostgres struct {
	pool *pgxpool.Pool
}

// NewRefreshPostgres creates a RefreshPostgres backed by the given pool.
// Share the same pool as the Postgres AccountStore to avoid opening a second
// connection set.
func NewRefreshPostgres(pool *pgxpool.Pool) *RefreshPostgres {
	return &RefreshPostgres{pool: pool}
}

// CreateToken inserts a new refresh_tokens row.
// tokenHash is the SHA-256 (base64url) of the raw token; raw value never stored.
func (r *RefreshPostgres) CreateToken(ctx context.Context, accountID, tokenHash, familyID string, expiresAt time.Time) error {
	const q = `
		INSERT INTO refresh_tokens (account_id, token_hash, family_id, expires_at)
		VALUES ($1, $2, $3, $4)`
	_, err := r.pool.Exec(ctx, q, accountID, tokenHash, familyID, expiresAt)
	if err != nil {
		return fmt.Errorf("refresh store: create token: %w", err)
	}
	return nil
}

// GetByHash retrieves the refresh token by its SHA-256 hash.
// Returns nil, nil when not found.
func (r *RefreshPostgres) GetByHash(ctx context.Context, tokenHash string) (*model.RefreshToken, error) {
	const q = `
		SELECT id, account_id, token_hash, family_id, expires_at, used_at, revoked_at, created_at
		FROM refresh_tokens
		WHERE token_hash = $1`
	row := r.pool.QueryRow(ctx, q, tokenHash)
	rt, err := scanRefreshToken(row)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("refresh store: get by hash: %w", err)
	}
	return rt, nil
}

// MarkUsed sets used_at = now() for the token with the given id.
func (r *RefreshPostgres) MarkUsed(ctx context.Context, id string) error {
	const q = `UPDATE refresh_tokens SET used_at = now() WHERE id = $1`
	_, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("refresh store: mark used: %w", err)
	}
	return nil
}

// RevokeFamily sets revoked_at = now() on all un-revoked tokens in the given family.
func (r *RefreshPostgres) RevokeFamily(ctx context.Context, familyID string) error {
	const q = `UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`
	_, err := r.pool.Exec(ctx, q, familyID)
	if err != nil {
		return fmt.Errorf("refresh store: revoke family: %w", err)
	}
	return nil
}

func scanRefreshToken(row scanner) (*model.RefreshToken, error) {
	var rt model.RefreshToken
	err := row.Scan(
		&rt.ID,
		&rt.AccountID,
		&rt.TokenHash,
		&rt.FamilyID,
		&rt.ExpiresAt,
		&rt.UsedAt,
		&rt.RevokedAt,
		&rt.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &rt, nil
}
