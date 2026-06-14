package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SessionEventPostgres implements EventStore using a pgx/v5 connection pool.
// Share the same pool as the other Postgres stores to avoid opening additional connections.
type SessionEventPostgres struct {
	pool *pgxpool.Pool
}

// NewSessionEventPostgres creates a SessionEventPostgres backed by the given pool.
func NewSessionEventPostgres(pool *pgxpool.Pool) *SessionEventPostgres {
	return &SessionEventPostgres{pool: pool}
}

// Record inserts one session_events row.
// Empty strings for deviceID and appVersion are coerced to SQL NULL via NULLIF.
func (s *SessionEventPostgres) Record(ctx context.Context, accountID, deviceID, eventType, appVersion string) error {
	const q = `
		INSERT INTO session_events (account_id, device_id, event_type, app_version)
		VALUES ($1, NULLIF($2, ''), $3, NULLIF($4, ''))`
	_, err := s.pool.Exec(ctx, q, accountID, deviceID, eventType, appVersion)
	if err != nil {
		return fmt.Errorf("event store: record: %w", err)
	}
	return nil
}
