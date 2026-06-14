// Package service contains domain-level business logic for the identity service.
package service

import (
	"context"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/meersajidh/ru-soam/server/identity/internal/model"
	"github.com/meersajidh/ru-soam/server/identity/internal/store"
	"github.com/meersajidh/ru-soam/server/identity/internal/util"
)

const refreshTokenBytes = 64 // produces an 86-char base64url string

// Tokens is the response returned to the Desktop after successful auth or rotation.
type Tokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"` // seconds
	TokenType    string `json:"token_type"` // always "Bearer"
}

// TokenService orchestrates JWT issuance, refresh rotation, and revocation.
// It is the offline-unit-testable core; the store dependency is injected.
type TokenService struct {
	signer     Signer
	store      store.RefreshTokenStore
	issuer     string
	accessTTL  time.Duration
	refreshTTL time.Duration
}

// NewTokenService creates a TokenService.
func NewTokenService(signer Signer, tokenStore store.RefreshTokenStore, issuer string, accessTTL, refreshTTL time.Duration) *TokenService {
	return &TokenService{
		signer:     signer,
		store:      tokenStore,
		issuer:     issuer,
		accessTTL:  accessTTL,
		refreshTTL: refreshTTL,
	}
}

// IssueForAccount mints a fresh access JWT + refresh token for account.
// A new token family is created; this is the root of a rotation lineage.
func (s *TokenService) IssueForAccount(ctx context.Context, acc *model.Account) (Tokens, error) {
	accessToken, err := s.signAccess(acc)
	if err != nil {
		return Tokens{}, fmt.Errorf("token: sign access: %w", err)
	}

	rawRefresh, err := util.CryptoRandomToken(refreshTokenBytes)
	if err != nil {
		return Tokens{}, fmt.Errorf("token: generate refresh: %w", err)
	}
	hash := util.S256Hash(rawRefresh)
	familyID := uuid.New().String()
	expiresAt := time.Now().Add(s.refreshTTL)

	if err := s.store.CreateToken(ctx, acc.ID, hash, familyID, expiresAt); err != nil {
		return Tokens{}, fmt.Errorf("token: store refresh: %w", err)
	}

	return Tokens{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		ExpiresIn:    int(s.accessTTL.Seconds()),
		TokenType:    "Bearer",
	}, nil
}

// Rotate validates rawRefresh and — if valid and unused — performs one-time rotation:
// marks the presented token used, inserts a sibling in the same family, issues a
// fresh access JWT.
//
// Reuse-detection: if used_at is already set on the presented token, the entire
// token family is revoked (RevokeFamily) and ErrReuse is returned.
//
// The second return value is the account_id for the rotated token family,
// enabling the caller to record a telemetry event with the account context.
func (s *TokenService) Rotate(ctx context.Context, rawRefresh string) (Tokens, string, error) {
	hash := util.S256Hash(rawRefresh)

	rt, err := s.store.GetByHash(ctx, hash)
	if err != nil {
		return Tokens{}, "", fmt.Errorf("token: rotate lookup: %w", err)
	}
	if rt == nil {
		return Tokens{}, "", ErrInvalidGrant
	}
	if rt.RevokedAt != nil {
		return Tokens{}, "", ErrInvalidGrant
	}
	if time.Now().After(rt.ExpiresAt) {
		// Best-effort revoke; ignore error — token expired regardless.
		_ = s.store.RevokeFamily(ctx, rt.FamilyID)
		return Tokens{}, "", ErrInvalidGrant
	}

	// Reuse-detection: already consumed → stolen token replay → revoke lineage.
	if rt.UsedAt != nil {
		if revokeErr := s.store.RevokeFamily(ctx, rt.FamilyID); revokeErr != nil {
			// Log but still return ErrReuse — safety is more important.
			_ = revokeErr
		}
		return Tokens{}, "", ErrReuse
	}

	// Mark presented token as used (one-time-use consumed).
	if err := s.store.MarkUsed(ctx, rt.ID); err != nil {
		return Tokens{}, "", fmt.Errorf("token: mark used: %w", err)
	}

	// Fetch account for access JWT claims.
	// We need account details; we only have account_id here.
	// Build a minimal Account from the refresh row — enough for claims.
	acc := &model.Account{ID: rt.AccountID}

	accessToken, err := s.signAccess(acc)
	if err != nil {
		return Tokens{}, "", fmt.Errorf("token: sign access: %w", err)
	}

	// Insert child refresh token in the SAME family (rotation lineage continues).
	rawNew, err := util.CryptoRandomToken(refreshTokenBytes)
	if err != nil {
		return Tokens{}, "", fmt.Errorf("token: generate new refresh: %w", err)
	}
	newHash := util.S256Hash(rawNew)
	newExpiresAt := time.Now().Add(s.refreshTTL)

	if err := s.store.CreateToken(ctx, rt.AccountID, newHash, rt.FamilyID, newExpiresAt); err != nil {
		return Tokens{}, "", fmt.Errorf("token: store rotated refresh: %w", err)
	}

	return Tokens{
		AccessToken:  accessToken,
		RefreshToken: rawNew,
		ExpiresIn:    int(s.accessTTL.Seconds()),
		TokenType:    "Bearer",
	}, rt.AccountID, nil
}

// Revoke revokes the token family for rawRefresh. Unknown tokens return ("", nil)
// (idempotent — do not leak token existence to callers).
//
// The first return value is the account_id of the revoked family, or "" when
// the token was unknown. Callers use this to record a signout telemetry event.
func (s *TokenService) Revoke(ctx context.Context, rawRefresh string) (string, error) {
	hash := util.S256Hash(rawRefresh)
	rt, err := s.store.GetByHash(ctx, hash)
	if err != nil {
		return "", fmt.Errorf("token: revoke lookup: %w", err)
	}
	if rt == nil {
		// Unknown token — idempotent 200, no account to attribute.
		return "", nil
	}
	if err := s.store.RevokeFamily(ctx, rt.FamilyID); err != nil {
		return "", fmt.Errorf("token: revoke family: %w", err)
	}
	return rt.AccountID, nil
}

// signAccess builds and signs an RS256 access JWT for acc.
func (s *TokenService) signAccess(acc *model.Account) (string, error) {
	jti, err := util.CryptoRandomToken(16)
	if err != nil {
		return "", fmt.Errorf("token: generate jti: %w", err)
	}
	now := time.Now()
	claims := model.Claims{
		EntityID: acc.EntityID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   acc.ID,
			Issuer:    s.issuer,
			ID:        jti,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTTL)),
		},
	}
	return s.signer.Sign(claims)
}

// Sentinel errors returned by TokenService — callers map these to HTTP status codes.

// ErrInvalidGrant is returned when a refresh token is missing, revoked, or expired.
var ErrInvalidGrant = fmt.Errorf("token: invalid_grant")

// ErrReuse is returned when a refresh token that was already consumed is presented
// again; the entire token family is revoked before this error is surfaced.
var ErrReuse = fmt.Errorf("token: refresh token reuse detected — family revoked")
