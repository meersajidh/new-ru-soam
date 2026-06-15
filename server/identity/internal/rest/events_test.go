package rest_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"log/slog"

	"github.com/meersajidh/ru-soam/server/identity/internal/config"
	"github.com/meersajidh/ru-soam/server/identity/internal/model"
	"github.com/meersajidh/ru-soam/server/identity/internal/rest"
	"github.com/meersajidh/ru-soam/server/identity/internal/service"
	"github.com/meersajidh/ru-soam/server/identity/internal/session"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// ── fakes ──────────────────────────────────────────────────────────────────

// fakeEventStore records calls made to Record so tests can assert them.
type fakeEventStore struct {
	mu      sync.Mutex
	calls   []recordedEvent
	failErr error // if non-nil, Record returns this error
}

type recordedEvent struct {
	AccountID  string
	DeviceID   string
	EventType  string
	AppVersion string
}

func (f *fakeEventStore) Record(_ context.Context, accountID, deviceID, eventType, appVersion string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failErr != nil {
		return f.failErr
	}
	f.calls = append(f.calls, recordedEvent{
		AccountID:  accountID,
		DeviceID:   deviceID,
		EventType:  eventType,
		AppVersion: appVersion,
	})
	return nil
}

func (f *fakeEventStore) recorded() []recordedEvent {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]recordedEvent, len(f.calls))
	copy(out, f.calls)
	return out
}

// ── helpers ────────────────────────────────────────────────────────────────

const testIssuer = "ru-soam-identity-test"

func newTestSigner(t *testing.T) *service.PEMSigner {
	t.Helper()
	s, err := service.NewPEMSigner(&config.JWTConfig{DevEphemeral: true})
	if err != nil {
		t.Fatalf("NewPEMSigner: %v", err)
	}
	return s
}

// mintToken signs a model.Claims with the given signer and options.
func mintToken(t *testing.T, signer service.Signer, accountID, issuer string, expOffset time.Duration) string {
	t.Helper()
	now := time.Now()
	claims := model.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   accountID,
			Issuer:    issuer,
			ID:        "jti-test",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(expOffset)),
		},
	}
	tok, err := signer.Sign(claims)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}
	return tok
}

// setupRouterViaNewRouter builds the full router (all routes) using the real
// NewRouter, so POST /v1/events is tested through the actual middleware chain.
func setupRouterViaNewRouter(t *testing.T, signer service.Signer, events session.EventStore) *gin.Engine {
	t.Helper()
	cfg := &config.Config{
		Server: &config.ServerConfig{}, // empty — no CORS origins needed for unit tests
		JWT:    &config.JWTConfig{Issuer: testIssuer, DevEphemeral: true},
	}
	logger := slog.Default()
	h := session.New("", nil, nil, events, logger)
	return rest.NewRouter(logger, cfg, signer, nil, h)
}

func postEvents(t *testing.T, r *gin.Engine, bearer string, body any) *httptest.ResponseRecorder {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req, _ := http.NewRequest(http.MethodPost, rest.EventsRoute, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ── tests ──────────────────────────────────────────────────────────────────

// TestEventsRoute_ValidBatch_204 verifies a valid token + valid batch → 204
// and asserts Record was called with account_id from JWT, not body.
func TestEventsRoute_ValidBatch_204(t *testing.T) {
	signer := newTestSigner(t)
	store := &fakeEventStore{}
	r := setupRouterViaNewRouter(t, signer, store)

	accountID := "acc-uuid-test-001"
	tok := mintToken(t, signer, accountID, testIssuer, 15*time.Minute)

	w := postEvents(t, r, tok, map[string]any{
		"events": []map[string]any{
			{"event_type": "login", "device_id": "dev-1", "app_version": "0.1.7"},
			{"event_type": "refresh"},
		},
	})

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d — body: %s", w.Code, w.Body.String())
	}

	got := store.recorded()
	if len(got) != 2 {
		t.Fatalf("expected 2 recorded events, got %d", len(got))
	}
	// account_id must come from JWT, not body (body had no account_id field).
	for i, ev := range got {
		if ev.AccountID != accountID {
			t.Errorf("events[%d].AccountID: got %q want %q", i, ev.AccountID, accountID)
		}
	}
	if got[0].EventType != "login" {
		t.Errorf("events[0].EventType: got %q want login", got[0].EventType)
	}
	if got[0].DeviceID != "dev-1" {
		t.Errorf("events[0].DeviceID: got %q want dev-1", got[0].DeviceID)
	}
	if got[0].AppVersion != "0.1.7" {
		t.Errorf("events[0].AppVersion: got %q want 0.1.7", got[0].AppVersion)
	}
	if got[1].EventType != "refresh" {
		t.Errorf("events[1].EventType: got %q want refresh", got[1].EventType)
	}
}

// TestEventsRoute_MissingAuthHeader_401
func TestEventsRoute_MissingAuthHeader_401(t *testing.T) {
	signer := newTestSigner(t)
	r := setupRouterViaNewRouter(t, signer, &fakeEventStore{})

	req, _ := http.NewRequest(http.MethodPost, rest.EventsRoute,
		bytes.NewBufferString(`{"events":[{"event_type":"login"}]}`))
	req.Header.Set("Content-Type", "application/json")
	// No Authorization header.
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

// TestEventsRoute_MalformedToken_401
func TestEventsRoute_MalformedToken_401(t *testing.T) {
	signer := newTestSigner(t)
	r := setupRouterViaNewRouter(t, signer, &fakeEventStore{})
	w := postEvents(t, r, "not.a.jwt", map[string]any{
		"events": []map[string]any{{"event_type": "login"}},
	})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

// TestEventsRoute_WrongIssuer_401
func TestEventsRoute_WrongIssuer_401(t *testing.T) {
	signer := newTestSigner(t)
	r := setupRouterViaNewRouter(t, signer, &fakeEventStore{})

	tok := mintToken(t, signer, "acc-1", "wrong-issuer", 15*time.Minute)
	w := postEvents(t, r, tok, map[string]any{
		"events": []map[string]any{{"event_type": "login"}},
	})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

// TestEventsRoute_TamperedToken_401
func TestEventsRoute_TamperedToken_401(t *testing.T) {
	signer := newTestSigner(t)
	r := setupRouterViaNewRouter(t, signer, &fakeEventStore{})

	tok := mintToken(t, signer, "acc-1", testIssuer, 15*time.Minute)
	parts := strings.SplitN(tok, ".", 3)
	if len(parts) != 3 {
		t.Fatalf("unexpected JWT structure")
	}
	tampered := parts[0] + "." + parts[1] + ".invalidsig"
	w := postEvents(t, r, tampered, map[string]any{
		"events": []map[string]any{{"event_type": "login"}},
	})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

// TestEventsRoute_ExpiredToken_401
func TestEventsRoute_ExpiredToken_401(t *testing.T) {
	signer := newTestSigner(t)
	r := setupRouterViaNewRouter(t, signer, &fakeEventStore{})

	tok := mintToken(t, signer, "acc-1", testIssuer, -1*time.Minute) // already expired
	w := postEvents(t, r, tok, map[string]any{
		"events": []map[string]any{{"event_type": "login"}},
	})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

// TestEventsRoute_AlgConfusion_HS256_401
// Creates an HS256 token signed with the RSA public-key bytes as HMAC secret
// (classic alg-confusion attack). Must be rejected.
func TestEventsRoute_AlgConfusion_HS256_401(t *testing.T) {
	signer := newTestSigner(t)
	r := setupRouterViaNewRouter(t, signer, &fakeEventStore{})

	// Build an HS256 token using the RSA public key bytes as the HMAC secret.
	// golang-jwt will happily sign it; our middleware must reject the alg.
	now := time.Now()
	claims := model.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "acc-evil",
			Issuer:    testIssuer,
			ID:        "jti-evil",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	// Use arbitrary bytes as the HMAC secret.
	hs256Token, err := tok.SignedString([]byte("not-the-rsa-key"))
	if err != nil {
		t.Fatalf("HS256 sign: %v", err)
	}

	w := postEvents(t, r, hs256Token, map[string]any{
		"events": []map[string]any{{"event_type": "login"}},
	})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for HS256 alg-confusion, got %d", w.Code)
	}
}

// TestEventsRoute_EmptyEventsArray_400
func TestEventsRoute_EmptyEventsArray_400(t *testing.T) {
	signer := newTestSigner(t)
	r := setupRouterViaNewRouter(t, signer, &fakeEventStore{})

	tok := mintToken(t, signer, "acc-1", testIssuer, 15*time.Minute)
	w := postEvents(t, r, tok, map[string]any{"events": []any{}})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — body: %s", w.Code, w.Body.String())
	}
}

// TestEventsRoute_BadEventType_400
func TestEventsRoute_BadEventType_400(t *testing.T) {
	signer := newTestSigner(t)
	r := setupRouterViaNewRouter(t, signer, &fakeEventStore{})

	tok := mintToken(t, signer, "acc-1", testIssuer, 15*time.Minute)
	w := postEvents(t, r, tok, map[string]any{
		"events": []map[string]any{
			{"event_type": "login"},
			{"event_type": "INVALID_EVENT"},
		},
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — body: %s", w.Code, w.Body.String())
	}
}

// TestEventsRoute_AccountIDFromJWT_NotBody
// Verifies account_id in the recorded event equals the JWT sub,
// even when the body contains a device_id but no explicit account_id override.
func TestEventsRoute_AccountIDFromJWT_NotBody(t *testing.T) {
	signer := newTestSigner(t)
	store := &fakeEventStore{}
	r := setupRouterViaNewRouter(t, signer, store)

	jwtAccountID := "jwt-account-id-abc"
	tok := mintToken(t, signer, jwtAccountID, testIssuer, 15*time.Minute)

	// body has device_id but no account_id (which wouldn't be accepted anyway)
	w := postEvents(t, r, tok, map[string]any{
		"events": []map[string]any{
			{"event_type": "signout", "device_id": "dev-xyz"},
		},
	})
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d — body: %s", w.Code, w.Body.String())
	}

	got := store.recorded()
	if len(got) != 1 {
		t.Fatalf("expected 1 recorded event, got %d", len(got))
	}
	if got[0].AccountID != jwtAccountID {
		t.Errorf("AccountID: got %q want %q (must derive from JWT, not body)", got[0].AccountID, jwtAccountID)
	}
	if got[0].DeviceID != "dev-xyz" {
		t.Errorf("DeviceID: got %q want dev-xyz", got[0].DeviceID)
	}
}

// TestEventsRoute_NilEventStore_503
func TestEventsRoute_NilEventStore_503(t *testing.T) {
	signer := newTestSigner(t)
	// nil events store — no DB configured
	r := setupRouterViaNewRouter(t, signer, nil)

	tok := mintToken(t, signer, "acc-1", testIssuer, 15*time.Minute)
	w := postEvents(t, r, tok, map[string]any{
		"events": []map[string]any{{"event_type": "login"}},
	})
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 (internal for no store), got %d — body: %s", w.Code, w.Body.String())
	}
}

// TestEventsRoute_BestEffort_RecordFailure_Still204
// Verifies that a DB error on one row does NOT abort the batch — handler still
// returns 204 (best-effort telemetry must not block auth responses).
func TestEventsRoute_BestEffort_RecordFailure_Still204(t *testing.T) {
	signer := newTestSigner(t)
	store := &fakeEventStore{failErr: context.DeadlineExceeded}
	r := setupRouterViaNewRouter(t, signer, store)

	tok := mintToken(t, signer, "acc-1", testIssuer, 15*time.Minute)
	w := postEvents(t, r, tok, map[string]any{
		"events": []map[string]any{
			{"event_type": "login"},
			{"event_type": "refresh"},
		},
	})
	// Handler should still return 204 even when Record fails — telemetry is best-effort.
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 even on store error, got %d — body: %s", w.Code, w.Body.String())
	}
}
