package service

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	testKID      = "test-kid-1"
	testAudience = "test-client-id"
	testSub      = "google-sub-12345"
	testEmail    = "practitioner@example.com"
)

// testEnv sets up a mock JWKS endpoint backed by key.
// Returns a cleanup func that resets globals.
func testEnv(t *testing.T, key *rsa.PrivateKey) func() {
	t.Helper()

	certsServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{ //nolint:errcheck
			"keys": []map[string]any{{
				"kid": testKID,
				"n":   base64.RawURLEncoding.EncodeToString(key.PublicKey.N.Bytes()),
				"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.PublicKey.E)).Bytes()),
			}},
		})
	}))

	origCerts := googleCertsURL
	googleCertsURL = certsServer.URL
	sharedJWKSCache = &jwksCache{}

	return func() {
		certsServer.Close()
		googleCertsURL = origCerts
		sharedJWKSCache = &jwksCache{}
	}
}

func signIDToken(t *testing.T, key *rsa.PrivateKey, claims googleClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = testKID
	raw, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return raw
}

func validClaims() googleClaims {
	now := time.Now()
	return googleClaims{
		Email: testEmail,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   testSub,
			Issuer:    "https://accounts.google.com",
			Audience:  jwt.ClaimStrings{testAudience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
		},
	}
}

func testKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	return key
}

func TestVerifyIDToken_ValidFlow(t *testing.T) {
	key := testKey(t)
	raw := signIDToken(t, key, validClaims())
	cleanup := testEnv(t, key)
	defer cleanup()

	id, err := VerifyIDToken(context.Background(), nil, raw, testAudience)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id.GoogleSub != testSub {
		t.Errorf("sub: got %q want %q", id.GoogleSub, testSub)
	}
	if id.Email != testEmail {
		t.Errorf("email: got %q want %q", id.Email, testEmail)
	}
}

func TestVerifyIDToken_WrongAudience(t *testing.T) {
	key := testKey(t)
	claims := validClaims()
	claims.Audience = jwt.ClaimStrings{"wrong-client-id"}
	raw := signIDToken(t, key, claims)
	cleanup := testEnv(t, key)
	defer cleanup()

	_, err := VerifyIDToken(context.Background(), nil, raw, testAudience)
	if err == nil {
		t.Fatal("expected error for wrong audience, got nil")
	}
}

func TestVerifyIDToken_WrongIssuer(t *testing.T) {
	key := testKey(t)
	claims := validClaims()
	claims.Issuer = "https://evil.example.com"
	raw := signIDToken(t, key, claims)
	cleanup := testEnv(t, key)
	defer cleanup()

	_, err := VerifyIDToken(context.Background(), nil, raw, testAudience)
	if err == nil {
		t.Fatal("expected error for wrong issuer, got nil")
	}
}

func TestVerifyIDToken_ExpiredToken(t *testing.T) {
	key := testKey(t)
	past := time.Now().Add(-2 * time.Hour)
	claims := googleClaims{
		Email: testEmail,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   testSub,
			Issuer:    "https://accounts.google.com",
			Audience:  jwt.ClaimStrings{testAudience},
			IssuedAt:  jwt.NewNumericDate(past),
			ExpiresAt: jwt.NewNumericDate(past.Add(time.Hour)),
		},
	}
	raw := signIDToken(t, key, claims)
	cleanup := testEnv(t, key)
	defer cleanup()

	_, err := VerifyIDToken(context.Background(), nil, raw, testAudience)
	if err == nil {
		t.Fatal("expected error for expired token, got nil")
	}
}

func TestVerifyIDToken_TamperedToken(t *testing.T) {
	key := testKey(t)
	// Sign with a different key — JWKS still serves the original key.
	wrongKey := testKey(t)
	tamperedRaw := signIDToken(t, wrongKey, validClaims())
	cleanup := testEnv(t, key)
	defer cleanup()

	_, err := VerifyIDToken(context.Background(), nil, tamperedRaw, testAudience)
	if err == nil {
		t.Fatal("expected error for tampered token, got nil")
	}
}
