// Package util provides cryptographic helpers for the identity service.
package util

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
)

// CryptoRandomToken generates a cryptographically-secure random token of nBytes
// bytes and returns it base64url-encoded (no padding). nBytes must be > 0.
//
// For refresh tokens use nBytes=64 (produces an 86-character string).
func CryptoRandomToken(nBytes int) (string, error) {
	if nBytes <= 0 {
		return "", fmt.Errorf("util: nBytes must be > 0, got %d", nBytes)
	}
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("util: read random bytes: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// S256Hash computes the SHA-256 of token and returns the result base64url-encoded
// (no padding). The input is treated as a raw string (UTF-8 bytes). The output
// is 43 characters for any non-empty input.
//
// This is intentionally infallible: SHA-256 never errors on valid Go byte slices.
// Callers store S256Hash(rawToken) — the raw value is never persisted.
func S256Hash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
