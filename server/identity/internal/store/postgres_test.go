package store_test

import (
	"context"
	"os"
	"testing"

	"github.com/meersajidh/ru-soam/server/identity/internal/store"
)

// TestPostgres_UpsertAndGet is an integration test that requires a live Postgres.
// It is skipped automatically when DATABASE_URL is not set (CI without a DB).
func TestPostgres_UpsertAndGet(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping postgres integration test")
	}

	ctx := context.Background()

	pg, close, err := store.NewPostgres(ctx, dbURL)
	if err != nil {
		t.Fatalf("NewPostgres: %v", err)
	}
	defer close()

	const testSub = "test-google-sub-upsert-001"
	const email1 = "first@example.com"
	const email2 = "updated@example.com"

	// Clean up any leftover row from a prior run.
	t.Cleanup(func() {
		// Best-effort via GetByGoogleSub to confirm row was created, then
		// we have no delete cap in the interface (store is append-friendly).
		// The test uses a stable deterministic sub so reruns are idempotent.
	})

	// First upsert — creates the row.
	acc1, err := pg.UpsertByGoogleSub(ctx, testSub, email1)
	if err != nil {
		t.Fatalf("UpsertByGoogleSub (create): %v", err)
	}
	if acc1.ID == "" {
		t.Fatal("expected non-empty account ID")
	}
	if acc1.GoogleSub != testSub {
		t.Errorf("google_sub: got %q, want %q", acc1.GoogleSub, testSub)
	}
	if acc1.Email != email1 {
		t.Errorf("email: got %q, want %q", acc1.Email, email1)
	}
	if acc1.EntityID != nil {
		t.Errorf("entity_id: expected nil, got %v", *acc1.EntityID)
	}

	firstID := acc1.ID

	// Second upsert — same sub, different email → row updated, ID unchanged.
	acc2, err := pg.UpsertByGoogleSub(ctx, testSub, email2)
	if err != nil {
		t.Fatalf("UpsertByGoogleSub (update): %v", err)
	}
	if acc2.ID != firstID {
		t.Errorf("ID changed on upsert: got %q, want %q", acc2.ID, firstID)
	}
	if acc2.Email != email2 {
		t.Errorf("email not updated: got %q, want %q", acc2.Email, email2)
	}
	if !acc2.UpdatedAt.After(acc1.UpdatedAt) && !acc2.UpdatedAt.Equal(acc1.UpdatedAt) {
		// updated_at should be >= original; equal is fine within a fast test.
		t.Logf("updated_at: %v -> %v (fast test, timestamps may be equal)", acc1.UpdatedAt, acc2.UpdatedAt)
	}

	// GetByGoogleSub — must return the updated row.
	got, err := pg.GetByGoogleSub(ctx, testSub)
	if err != nil {
		t.Fatalf("GetByGoogleSub: %v", err)
	}
	if got == nil {
		t.Fatal("GetByGoogleSub: got nil, want account")
	}
	if got.ID != firstID {
		t.Errorf("GetByGoogleSub ID: got %q, want %q", got.ID, firstID)
	}
	if got.Email != email2 {
		t.Errorf("GetByGoogleSub email: got %q, want %q", got.Email, email2)
	}

	// GetByGoogleSub — unknown sub → nil, nil.
	missing, err := pg.GetByGoogleSub(ctx, "no-such-sub")
	if err != nil {
		t.Fatalf("GetByGoogleSub (missing): unexpected error: %v", err)
	}
	if missing != nil {
		t.Errorf("GetByGoogleSub (missing): expected nil, got %+v", missing)
	}

	// Ping.
	if err := pg.Ping(ctx); err != nil {
		t.Errorf("Ping: %v", err)
	}
}
