package rest_test

// Tests for POST /v1/account/delete (ADR-311 Amendment 2 / O477).
//
// This file extends the rest_test package established by events_test.go.
// It reuses newTestSigner, setupRouterViaNewRouter, and gin.TestMode init().

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/meersajidh/ru-soam/server/identity/internal/config"
	"github.com/meersajidh/ru-soam/server/identity/internal/model"
	"github.com/meersajidh/ru-soam/server/identity/internal/rest"
	"github.com/meersajidh/ru-soam/server/identity/internal/service"
	"github.com/meersajidh/ru-soam/server/identity/internal/session"
	"log/slog"

	"github.com/gin-gonic/gin"
)

// ── fakes (account delete) ────────────────────────────────────────────────────

// fakeAccountStore implements session.AccountStore for handler tests.
type fakeAccountStore struct {
	mu               sync.Mutex
	upsertResult     *model.Account
	upsertErr        error
	markDeletedCalls []string // accountIDs passed to MarkDeleted
	markDeletedErr   error
}

func (f *fakeAccountStore) UpsertByGoogleSub(_ context.Context, _, _ string) (*model.Account, error) {
	return f.upsertResult, f.upsertErr
}

func (f *fakeAccountStore) MarkDeleted(_ context.Context, accountID string) error {
	f.mu.Lock()
	f.markDeletedCalls = append(f.markDeletedCalls, accountID)
	f.mu.Unlock()
	return f.markDeletedErr
}

func (f *fakeAccountStore) markedDeleted() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, len(f.markDeletedCalls))
	copy(out, f.markDeletedCalls)
	return out
}

// fakeRefreshStoreForDelete is a minimal in-memory RefreshTokenStore that supports
// issue + revoke for the DeleteAccount handler tests.
type fakeRefreshStoreForDelete struct {
	mu     sync.Mutex
	tokens map[string]*model.RefreshToken // keyed by token_hash
}

func newFakeRefreshStoreForDelete() *fakeRefreshStoreForDelete {
	return &fakeRefreshStoreForDelete{tokens: make(map[string]*model.RefreshToken)}
}

func (f *fakeRefreshStoreForDelete) CreateToken(_ context.Context, accountID, tokenHash, familyID string, expiresAt time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.tokens[tokenHash] = &model.RefreshToken{
		ID:        tokenHash,
		AccountID: accountID,
		TokenHash: tokenHash,
		FamilyID:  familyID,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
	}
	return nil
}

func (f *fakeRefreshStoreForDelete) GetByHash(_ context.Context, tokenHash string) (*model.RefreshToken, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rt, ok := f.tokens[tokenHash]
	if !ok {
		return nil, nil
	}
	cp := *rt
	return &cp, nil
}

func (f *fakeRefreshStoreForDelete) MarkUsed(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	now := time.Now()
	if rt, ok := f.tokens[id]; ok {
		rt.UsedAt = &now
	}
	return nil
}

func (f *fakeRefreshStoreForDelete) RevokeFamily(_ context.Context, familyID string) error {
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

// ── helpers ───────────────────────────────────────────────────────────────────

// setupRouterForDelete builds a router with a real TokenService backed by the
// given fake refresh store and account store.
func setupRouterForDelete(t *testing.T, accStore session.AccountStore, refreshStore service.RefreshTokenStore) (*gin.Engine, *service.TokenService) {
	t.Helper()
	signer := newTestSigner(t)
	tokens := service.NewTokenService(
		signer,
		refreshStore,
		testIssuer,
		15*time.Minute, // accessTTL
		7*24*time.Hour, // refreshTTL
	)
	cfg := &config.Config{
		Server: &config.ServerConfig{},
		JWT:    &config.JWTConfig{Issuer: testIssuer, DevEphemeral: true},
	}
	logger := slog.Default()
	h := session.New("", accStore, tokens, nil, logger)
	r := rest.NewRouter(logger, cfg, signer, nil, h)
	return r, tokens
}

// issueRefreshToken issues a real refresh token for testAccountID and returns the raw token.
func issueRefreshToken(t *testing.T, tokens *service.TokenService, accountID string) string {
	t.Helper()
	acc := &model.Account{
		ID:        accountID,
		GoogleSub: "sub-" + accountID,
		Email:     accountID + "@example.com",
		Status:    "active",
	}
	issued, err := tokens.IssueForAccount(context.Background(), acc)
	if err != nil {
		t.Fatalf("IssueForAccount: %v", err)
	}
	return issued.RefreshToken
}

func postAccountDelete(t *testing.T, r *gin.Engine, refreshToken string) *httptest.ResponseRecorder {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"refresh_token": refreshToken})
	req, _ := http.NewRequest(http.MethodPost, rest.AccountDeleteRoute, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ── tests ─────────────────────────────────────────────────────────────────────

// TestDeleteAccount_ValidToken_204_AccountMarkedDeleted verifies:
//   - valid refresh token → 204
//   - MarkDeleted called with correct accountID
func TestDeleteAccount_ValidToken_204_AccountMarkedDeleted(t *testing.T) {
	refreshStore := newFakeRefreshStoreForDelete()
	accStore := &fakeAccountStore{}
	r, tokens := setupRouterForDelete(t, accStore, refreshStore)

	const accountID = "acct-delete-test-001"
	rawRT := issueRefreshToken(t, tokens, accountID)

	w := postAccountDelete(t, r, rawRT)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d — body: %s", w.Code, w.Body.String())
	}

	marked := accStore.markedDeleted()
	if len(marked) != 1 {
		t.Fatalf("MarkDeleted calls: got %d, want 1", len(marked))
	}
	if marked[0] != accountID {
		t.Errorf("MarkDeleted accountID: got %q, want %q", marked[0], accountID)
	}
}

// TestDeleteAccount_UnknownToken_204_NoMarkDeleted verifies idempotency:
// an unknown / already-consumed token → 204, no MarkDeleted.
func TestDeleteAccount_UnknownToken_204_NoMarkDeleted(t *testing.T) {
	refreshStore := newFakeRefreshStoreForDelete()
	accStore := &fakeAccountStore{}
	r, _ := setupRouterForDelete(t, accStore, refreshStore)

	w := postAccountDelete(t, r, "unknown-refresh-token-xyz")
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for unknown token, got %d — body: %s", w.Code, w.Body.String())
	}

	marked := accStore.markedDeleted()
	if len(marked) != 0 {
		t.Errorf("MarkDeleted should not be called for unknown token, got calls: %v", marked)
	}
}

// TestDeleteAccount_MissingToken_400 verifies missing refresh_token → 400.
func TestDeleteAccount_MissingToken_400(t *testing.T) {
	refreshStore := newFakeRefreshStoreForDelete()
	accStore := &fakeAccountStore{}
	r, _ := setupRouterForDelete(t, accStore, refreshStore)

	body, _ := json.Marshal(map[string]string{})
	req, _ := http.NewRequest(http.MethodPost, rest.AccountDeleteRoute, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing refresh_token, got %d", w.Code)
	}
}
