package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/meersajidh/ru-soam/server/identity/internal/model"
)

// Postgres implements AccountStore using pgx/v5 connection pool.
type Postgres struct {
	pool *pgxpool.Pool
}

// NewPostgres creates a Postgres store from a connection URL, returning the
// store and a close func to release the pool. Caller must call close when done.
func NewPostgres(ctx context.Context, databaseURL string) (*Postgres, func(), error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, nil, fmt.Errorf("store: connect pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, nil, fmt.Errorf("store: ping pool: %w", err)
	}
	close := func() { pool.Close() }
	return &Postgres{pool: pool}, close, nil
}

// UpsertByGoogleSub inserts or updates the account for the given Google sub.
//
// Tombstone model (ADR-311 §A2.3): deleted accounts are permanent tombstones —
// they are never reactivated. The partial unique index
// accounts_google_sub_active_key covers only active rows, so:
//   - No active row exists (first signup, or all prior rows are deleted tombstones)
//     → INSERT a new active row with a fresh id.
//   - An active row exists (O475 reconnect: same live account, dead refresh)
//     → UPDATE email only (no status/deleted_at touch).
//
// Returns the current persisted account (the new or existing active row).
func (p *Postgres) UpsertByGoogleSub(ctx context.Context, googleSub, email string) (*model.Account, error) {
	const q = `
		INSERT INTO accounts (google_sub, email)
		VALUES ($1, $2)
		ON CONFLICT (google_sub) WHERE status = 'active' DO UPDATE
		  SET email      = EXCLUDED.email,
		      updated_at = now()
		RETURNING id, google_sub, email, entity_id, status, deleted_at, created_at, updated_at`

	row := p.pool.QueryRow(ctx, q, googleSub, email)

	acc, err := scanAccount(row)
	if err != nil {
		return nil, fmt.Errorf("store: upsert account: %w", err)
	}
	return acc, nil
}

// GetByGoogleSub retrieves the active account for the given Google sub.
// Returns nil, nil when no active account exists (sub unknown, or only
// deleted tombstones remain). Never returns a deleted row.
func (p *Postgres) GetByGoogleSub(ctx context.Context, googleSub string) (*model.Account, error) {
	const q = `
		SELECT id, google_sub, email, entity_id, status, deleted_at, created_at, updated_at
		FROM accounts
		WHERE google_sub = $1
		  AND status = 'active'`

	row := p.pool.QueryRow(ctx, q, googleSub)
	acc, err := scanAccount(row)
	if err != nil {
		// pgx returns pgx.ErrNoRows when no row; translate to nil,nil.
		if isNoRows(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("store: get account: %w", err)
	}
	return acc, nil
}

// MarkDeleted soft-deletes the account by setting status='deleted' and deleted_at=now().
// All other columns (email, entity_id, etc.) are retained for history.
// Idempotent: re-marking an already-deleted account is a no-op.
func (p *Postgres) MarkDeleted(ctx context.Context, accountID string) error {
	const q = `
		UPDATE accounts
		SET status     = 'deleted',
		    deleted_at = now(),
		    updated_at = now()
		WHERE id = $1`

	_, err := p.pool.Exec(ctx, q, accountID)
	if err != nil {
		return fmt.Errorf("store: mark account deleted: %w", err)
	}
	return nil
}

// Ping checks reachability of the Postgres pool.
func (p *Postgres) Ping(ctx context.Context) error {
	return p.pool.Ping(ctx)
}

// Pool returns the underlying pgxpool.Pool so other stores can share the connection
// set without opening a second pool to the same database.
func (p *Postgres) Pool() *pgxpool.Pool {
	return p.pool
}

// scanner abstracts pgx Row/Rows for testability.
type scanner interface {
	Scan(dest ...any) error
}

func scanAccount(row scanner) (*model.Account, error) {
	var acc model.Account
	var entityID *string     // nullable UUID stored as text pointer
	var deletedAt *time.Time // nullable timestamp
	err := row.Scan(
		&acc.ID,
		&acc.GoogleSub,
		&acc.Email,
		&entityID,
		&acc.Status,
		&deletedAt,
		&acc.CreatedAt,
		&acc.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	acc.EntityID = entityID
	acc.DeletedAt = deletedAt
	return &acc, nil
}

// isNoRows returns true when err is pgx's "no rows" sentinel.
func isNoRows(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
