package store_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/meersajidh/ru-soam/server/identity/internal/store"
	"github.com/meersajidh/ru-soam/server/identity/internal/util"
)

// TestRefreshPostgres exercises the full CRUD cycle against a real Postgres.
// The test is skipped automatically when DATABASE_URL is not set so the offline
// CI gate (go test ./...) stays green.
func TestRefreshPostgres_CRUD(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping integration test")
	}

	ctx := context.Background()
	pg, closeFn, err := store.NewPostgres(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer closeFn()

	// Upsert an account to satisfy the FK constraint.
	acc, err := pg.UpsertByGoogleSub(ctx, "test-sub-refresh-"+uuid.NewString(), "test@example.com")
	if err != nil {
		t.Fatalf("upsert account: %v", err)
	}

	refreshStore := store.NewRefreshPostgres(pg.Pool())

	rawToken, err := util.CryptoRandomToken(64)
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	hash := util.S256Hash(rawToken)
	familyID := uuid.New().String()
	expiresAt := time.Now().Add(24 * time.Hour)

	// CreateToken.
	if err := refreshStore.CreateToken(ctx, acc.ID, hash, familyID, expiresAt); err != nil {
		t.Fatalf("CreateToken: %v", err)
	}

	// GetByHash — must find it.
	rt, err := refreshStore.GetByHash(ctx, hash)
	if err != nil {
		t.Fatalf("GetByHash: %v", err)
	}
	if rt == nil {
		t.Fatal("GetByHash: expected non-nil RefreshToken")
	}
	if rt.AccountID != acc.ID {
		t.Errorf("AccountID: got %q want %q", rt.AccountID, acc.ID)
	}
	if rt.FamilyID != familyID {
		t.Errorf("FamilyID: got %q want %q", rt.FamilyID, familyID)
	}
	if rt.UsedAt != nil {
		t.Error("UsedAt should be nil on fresh token")
	}
	if rt.RevokedAt != nil {
		t.Error("RevokedAt should be nil on fresh token")
	}

	// GetByHash — unknown hash returns nil, nil.
	missing, err := refreshStore.GetByHash(ctx, "not-a-real-hash")
	if err != nil {
		t.Fatalf("GetByHash unknown: %v", err)
	}
	if missing != nil {
		t.Error("expected nil for unknown hash")
	}

	// MarkUsed.
	if err := refreshStore.MarkUsed(ctx, rt.ID); err != nil {
		t.Fatalf("MarkUsed: %v", err)
	}
	after, _ := refreshStore.GetByHash(ctx, hash)
	if after.UsedAt == nil {
		t.Error("UsedAt should be set after MarkUsed")
	}

	// RevokeFamily.
	if err := refreshStore.RevokeFamily(ctx, familyID); err != nil {
		t.Fatalf("RevokeFamily: %v", err)
	}
	revoked, _ := refreshStore.GetByHash(ctx, hash)
	if revoked.RevokedAt == nil {
		t.Error("RevokedAt should be set after RevokeFamily")
	}
}
