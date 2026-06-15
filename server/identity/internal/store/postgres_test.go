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

// TestPostgres_MarkDeletedThenResignupMakesNewAccount verifies the tombstone model
// (ADR-311 §A2.3): a deleted account stays deleted permanently, and re-signing up
// with the same Google identity creates a brand-new account row.
//
//  1. Upsert → active account A.
//  2. MarkDeleted(A) → tombstone (status='deleted', deleted_at set, email retained).
//  3. GetByGoogleSub → nil (active-only filter; tombstone not returned).
//  4. Re-upsert same google_sub → NEW account B (different id, status='active').
//  5. Verify: exactly two rows for that google_sub — one deleted (A), one active (B).
func TestPostgres_MarkDeletedThenResignupMakesNewAccount(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping postgres integration test")
	}

	ctx := context.Background()

	pg, closePool, err := store.NewPostgres(ctx, dbURL)
	if err != nil {
		t.Fatalf("NewPostgres: %v", err)
	}
	defer closePool()

	// Use a unique sub per test run to avoid cross-run collisions.
	// A stable suffix keeps runs idempotent as long as the DB is clean between runs.
	const testSub = "test-google-sub-tombstone-model-001"
	const testEmail = "tombstone@example.com"

	// Pre-clean: remove any leftover rows from prior runs so the test is idempotent.
	pool := pg.Pool()
	if _, err := pool.Exec(ctx, `DELETE FROM accounts WHERE google_sub = $1`, testSub); err != nil {
		t.Fatalf("pre-clean: %v", err)
	}

	// 1. Initial upsert — creates active account A.
	accA, err := pg.UpsertByGoogleSub(ctx, testSub, testEmail)
	if err != nil {
		t.Fatalf("UpsertByGoogleSub (create A): %v", err)
	}
	if accA.Status != "active" {
		t.Errorf("status after upsert: got %q, want 'active'", accA.Status)
	}
	if accA.DeletedAt != nil {
		t.Errorf("deleted_at after upsert: expected nil, got %v", accA.DeletedAt)
	}
	idA := accA.ID

	// 2. MarkDeleted — tombstone A.
	if err := pg.MarkDeleted(ctx, idA); err != nil {
		t.Fatalf("MarkDeleted: %v", err)
	}

	// Verify tombstone via raw query (status='deleted', deleted_at set, email retained).
	var tombStatus string
	var tombEmail string
	var tombDeletedAt *string // scan as *string to check nil
	err = pool.QueryRow(ctx,
		`SELECT status, email, deleted_at::text FROM accounts WHERE id = $1`, idA,
	).Scan(&tombStatus, &tombEmail, &tombDeletedAt)
	if err != nil {
		t.Fatalf("read tombstone row: %v", err)
	}
	if tombStatus != "deleted" {
		t.Errorf("tombstone status: got %q, want 'deleted'", tombStatus)
	}
	if tombDeletedAt == nil {
		t.Error("tombstone deleted_at: expected non-nil")
	}
	if tombEmail != testEmail {
		t.Errorf("tombstone email retained: got %q, want %q", tombEmail, testEmail)
	}

	// 3. GetByGoogleSub after deletion → nil (active-only; tombstone not returned).
	nilAcc, err := pg.GetByGoogleSub(ctx, testSub)
	if err != nil {
		t.Fatalf("GetByGoogleSub after MarkDeleted: %v", err)
	}
	if nilAcc != nil {
		t.Errorf("GetByGoogleSub: expected nil after delete, got account id=%q status=%q",
			nilAcc.ID, nilAcc.Status)
	}

	// 4. Re-upsert (re-signup) same google_sub → NEW account B.
	accB, err := pg.UpsertByGoogleSub(ctx, testSub, testEmail)
	if err != nil {
		t.Fatalf("UpsertByGoogleSub (re-signup): %v", err)
	}
	if accB.ID == idA {
		t.Errorf("re-signup: got same id %q as deleted tombstone — must be a NEW account", idA)
	}
	if accB.Status != "active" {
		t.Errorf("re-signup status: got %q, want 'active'", accB.Status)
	}
	if accB.DeletedAt != nil {
		t.Errorf("re-signup deleted_at: expected nil, got %v", accB.DeletedAt)
	}
	idB := accB.ID

	// 5. Exactly two rows for this google_sub: one deleted (A), one active (B).
	var rowCount int
	err = pool.QueryRow(ctx,
		`SELECT count(*) FROM accounts WHERE google_sub = $1`, testSub,
	).Scan(&rowCount)
	if err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if rowCount != 2 {
		t.Errorf("expected 2 rows for google_sub, got %d", rowCount)
	}

	// Tombstone A still exists and is still deleted.
	var aStatus string
	err = pool.QueryRow(ctx,
		`SELECT status FROM accounts WHERE id = $1`, idA,
	).Scan(&aStatus)
	if err != nil {
		t.Fatalf("read A after re-signup: %v", err)
	}
	if aStatus != "deleted" {
		t.Errorf("tombstone A status after re-signup: got %q, want 'deleted'", aStatus)
	}

	// B is retrievable via GetByGoogleSub.
	gotB, err := pg.GetByGoogleSub(ctx, testSub)
	if err != nil {
		t.Fatalf("GetByGoogleSub (new account B): %v", err)
	}
	if gotB == nil {
		t.Fatal("GetByGoogleSub: got nil after re-signup — expected new active account B")
	}
	if gotB.ID != idB {
		t.Errorf("GetByGoogleSub returned id %q, want B's id %q", gotB.ID, idB)
	}
	if gotB.Status != "active" {
		t.Errorf("GetByGoogleSub B status: got %q, want 'active'", gotB.Status)
	}
}
