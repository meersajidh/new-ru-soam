package service_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/meersajidh/ru-soam/server/identity/internal/config"
	"github.com/meersajidh/ru-soam/server/identity/internal/model"
	"github.com/meersajidh/ru-soam/server/identity/internal/service"
	"github.com/meersajidh/ru-soam/server/identity/internal/util"
)

// ── Fake RefreshTokenStore ────────────────────────────────────────────────────

// fakeRefreshStore is an in-memory store.RefreshTokenStore used in offline tests.
// It faithfully models used_at, revoked_at, and family_id so the reuse-detection
// path in TokenService actually triggers RevokeFamily.
type fakeRefreshStore struct {
	mu     sync.Mutex
	tokens map[string]*model.RefreshToken // keyed by token_hash
}

func newFakeStore() *fakeRefreshStore {
	return &fakeRefreshStore{tokens: make(map[string]*model.RefreshToken)}
}

func (f *fakeRefreshStore) CreateToken(_ context.Context, accountID, tokenHash, familyID string, expiresAt time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.tokens[tokenHash] = &model.RefreshToken{
		ID:        tokenHash, // synthetic id: use hash for simplicity
		AccountID: accountID,
		TokenHash: tokenHash,
		FamilyID:  familyID,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
	}
	return nil
}

func (f *fakeRefreshStore) GetByHash(_ context.Context, tokenHash string) (*model.RefreshToken, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rt, ok := f.tokens[tokenHash]
	if !ok {
		return nil, nil
	}
	cp := *rt
	return &cp, nil
}

func (f *fakeRefreshStore) MarkUsed(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	now := time.Now()
	if rt, ok := f.tokens[id]; ok {
		rt.UsedAt = &now
	}
	return nil
}

func (f *fakeRefreshStore) RevokeFamily(_ context.Context, familyID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	now := time.Now()
	for _, rt := range f.tokens {
		if rt.FamilyID == familyID && rt.RevokedAt == nil {
			t := now
			rt.RevokedAt = &t
		}
	}
	return nil
}

// revokedInFamily returns how many tokens in familyID have revoked_at set.
func (f *fakeRefreshStore) revokedInFamily(familyID string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, rt := range f.tokens {
		if rt.FamilyID == familyID && rt.RevokedAt != nil {
			n++
		}
	}
	return n
}

// familyIDFor returns the family_id of the token whose hash matches rawToken.
func (f *fakeRefreshStore) familyIDFor(rawToken string) string {
	hash := util.S256Hash(rawToken)
	f.mu.Lock()
	defer f.mu.Unlock()
	if rt, ok := f.tokens[hash]; ok {
		return rt.FamilyID
	}
	return ""
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func newTokenSvc(t *testing.T, fstore *fakeRefreshStore) *service.TokenService {
	t.Helper()
	signer, err := service.NewPEMSigner(&config.JWTConfig{DevEphemeral: true})
	if err != nil {
		t.Fatalf("NewPEMSigner: %v", err)
	}
	return service.NewTokenService(signer, fstore, "ru-soam-identity", 15*time.Minute, 30*24*time.Hour)
}

func testAccount() *model.Account {
	return &model.Account{ID: "acc-uuid-0001"}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestTokenService_IssueForAccount(t *testing.T) {
	t.Parallel()
	fstore := newFakeStore()
	svc := newTokenSvc(t, fstore)

	tokens, err := svc.IssueForAccount(context.Background(), testAccount())
	if err != nil {
		t.Fatalf("IssueForAccount: %v", err)
	}
	if tokens.AccessToken == "" {
		t.Error("access_token empty")
	}
	if tokens.RefreshToken == "" {
		t.Error("refresh_token empty")
	}
	if tokens.ExpiresIn <= 0 {
		t.Errorf("expires_in=%d, want >0", tokens.ExpiresIn)
	}
	if tokens.TokenType != "Bearer" {
		t.Errorf("token_type=%q, want Bearer", tokens.TokenType)
	}
}

func TestTokenService_Rotate_Success(t *testing.T) {
	t.Parallel()
	fstore := newFakeStore()
	svc := newTokenSvc(t, fstore)

	first, err := svc.IssueForAccount(context.Background(), testAccount())
	if err != nil {
		t.Fatalf("IssueForAccount: %v", err)
	}

	second, err := svc.Rotate(context.Background(), first.RefreshToken)
	if err != nil {
		t.Fatalf("Rotate: %v", err)
	}
	if second.AccessToken == "" || second.RefreshToken == "" {
		t.Fatal("Rotate returned empty tokens")
	}
	if second.RefreshToken == first.RefreshToken {
		t.Error("rotated refresh_token must differ from original")
	}

	// Both tokens share the same family.
	fam1 := fstore.familyIDFor(first.RefreshToken)
	fam2 := fstore.familyIDFor(second.RefreshToken)
	if fam1 != fam2 {
		t.Errorf("family_id mismatch after rotation: %q != %q", fam1, fam2)
	}

	// Original token marked used.
	hash1 := util.S256Hash(first.RefreshToken)
	fstore.mu.Lock()
	rt1 := fstore.tokens[hash1]
	fstore.mu.Unlock()
	if rt1.UsedAt == nil {
		t.Error("original token UsedAt should be set after rotation")
	}
}

func TestTokenService_Reuse_RevokesFamily(t *testing.T) {
	t.Parallel()
	fstore := newFakeStore()
	svc := newTokenSvc(t, fstore)

	// Issue root tokens.
	first, err := svc.IssueForAccount(context.Background(), testAccount())
	if err != nil {
		t.Fatalf("IssueForAccount: %v", err)
	}

	// Legitimate first rotation.
	_, err = svc.Rotate(context.Background(), first.RefreshToken)
	if err != nil {
		t.Fatalf("first Rotate: %v", err)
	}

	// Replay already-consumed first token → reuse detection.
	_, err = svc.Rotate(context.Background(), first.RefreshToken)
	if err == nil {
		t.Fatal("expected ErrReuse on replay, got nil")
	}
	if !errors.Is(err, service.ErrReuse) {
		t.Errorf("expected errors.Is(err, ErrReuse), got: %v", err)
	}

	// Entire family must be revoked.
	familyID := fstore.familyIDFor(first.RefreshToken)
	if fstore.revokedInFamily(familyID) == 0 {
		t.Error("family tokens not revoked after reuse detection")
	}
}

func TestTokenService_Rotate_RevokesBeforeRotation(t *testing.T) {
	// After reuse is detected the subsequent Rotate on the NEW token must also fail
	// because the family was revoked.
	t.Parallel()
	fstore := newFakeStore()
	svc := newTokenSvc(t, fstore)

	first, _ := svc.IssueForAccount(context.Background(), testAccount())
	second, _ := svc.Rotate(context.Background(), first.RefreshToken)

	// Trigger reuse — revokes family.
	_, _ = svc.Rotate(context.Background(), first.RefreshToken)

	// Now try to use the legitimate second token — must be rejected (revoked).
	_, err := svc.Rotate(context.Background(), second.RefreshToken)
	if err == nil {
		t.Fatal("expected error when family is revoked, got nil")
	}
}

func TestTokenService_Revoke_RevokesFamily(t *testing.T) {
	t.Parallel()
	fstore := newFakeStore()
	svc := newTokenSvc(t, fstore)

	first, err := svc.IssueForAccount(context.Background(), testAccount())
	if err != nil {
		t.Fatalf("IssueForAccount: %v", err)
	}
	familyID := fstore.familyIDFor(first.RefreshToken)

	if err := svc.Revoke(context.Background(), first.RefreshToken); err != nil {
		t.Fatalf("Revoke: %v", err)
	}

	if fstore.revokedInFamily(familyID) == 0 {
		t.Error("expected family to be revoked")
	}
}

func TestTokenService_Revoke_UnknownToken_Idempotent(t *testing.T) {
	t.Parallel()
	fstore := newFakeStore()
	svc := newTokenSvc(t, fstore)

	if err := svc.Revoke(context.Background(), "not-a-known-token"); err != nil {
		t.Fatalf("Revoke unknown: %v", err)
	}
}

func TestTokenService_ExpiredRefresh_Rejected(t *testing.T) {
	t.Parallel()
	fstore := newFakeStore()
	signer, _ := service.NewPEMSigner(&config.JWTConfig{DevEphemeral: true})
	// Very short (negative) TTL so the token is already expired at insert time.
	svc := service.NewTokenService(signer, fstore, "ru-soam-identity", 15*time.Minute, -1*time.Second)

	first, err := svc.IssueForAccount(context.Background(), testAccount())
	if err != nil {
		t.Fatalf("IssueForAccount: %v", err)
	}

	_, err = svc.Rotate(context.Background(), first.RefreshToken)
	if err == nil {
		t.Fatal("expected error for expired token, got nil")
	}
}
