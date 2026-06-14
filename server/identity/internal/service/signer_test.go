package service_test

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/meersajidh/ru-soam/server/identity/internal/config"
	"github.com/meersajidh/ru-soam/server/identity/internal/model"
	"github.com/meersajidh/ru-soam/server/identity/internal/service"
)

func ephemeralSigner(t *testing.T) *service.PEMSigner {
	t.Helper()
	signer, err := service.NewPEMSigner(&config.JWTConfig{DevEphemeral: true})
	if err != nil {
		t.Fatalf("NewPEMSigner(ephemeral): %v", err)
	}
	return signer
}

func TestPEMSigner_Ephemeral_RoundTrip(t *testing.T) {
	t.Parallel()
	signer := ephemeralSigner(t)

	now := time.Now()
	claims := model.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "account-uuid-123",
			Issuer:    "ru-soam-identity",
			ID:        "jti-abc",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
		},
	}

	tokenStr, err := signer.Sign(claims)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}
	if tokenStr == "" {
		t.Fatal("Sign returned empty string")
	}

	parsed, err := service.Verify(tokenStr, signer)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if parsed.Subject != "account-uuid-123" {
		t.Errorf("Subject: got %q want %q", parsed.Subject, "account-uuid-123")
	}
	if parsed.Issuer != "ru-soam-identity" {
		t.Errorf("Issuer: got %q want %q", parsed.Issuer, "ru-soam-identity")
	}
}

func TestPEMSigner_TamperedToken_Rejected(t *testing.T) {
	t.Parallel()
	signer := ephemeralSigner(t)

	claims := model.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "acc-1",
			Issuer:    "ru-soam-identity",
			ID:        "jti-1",
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
		},
	}
	tokenStr, err := signer.Sign(claims)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	// Tamper: replace the signature segment (last JWT part) with garbage.
	// Split on "." — a valid JWT has exactly 3 parts.
	parts := strings.SplitN(tokenStr, ".", 3)
	if len(parts) != 3 {
		t.Fatalf("unexpected JWT structure: %q", tokenStr)
	}
	// Replace the signature with a clearly invalid value.
	tampered := parts[0] + "." + parts[1] + ".invalidsignatureXXX"

	_, err = service.Verify(tampered, signer)
	if err == nil {
		t.Fatal("expected error for tampered token, got nil")
	}
}

func TestPEMSigner_ExpiredToken_Rejected(t *testing.T) {
	t.Parallel()
	signer := ephemeralSigner(t)

	claims := model.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "acc-1",
			Issuer:    "ru-soam-identity",
			ID:        "jti-exp",
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)), // expired
		},
	}
	tokenStr, err := signer.Sign(claims)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	_, err = service.Verify(tokenStr, signer)
	if err == nil {
		t.Fatal("expected error for expired token, got nil")
	}
}

func TestPEMSigner_HardFail_NoKey(t *testing.T) {
	t.Parallel()
	_, err := service.NewPEMSigner(&config.JWTConfig{})
	if err == nil {
		t.Fatal("expected hard-fail when no key configured and DevEphemeral=false")
	}
}

func TestPEMSigner_PublicKey_NotNil(t *testing.T) {
	t.Parallel()
	signer := ephemeralSigner(t)
	if signer.Public() == nil {
		t.Fatal("Public() returned nil")
	}
}
