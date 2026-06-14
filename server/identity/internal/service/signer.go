// Package service contains domain-level business logic for the identity service.
package service

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"log/slog"
	"os"

	"github.com/golang-jwt/jwt/v5"

	"github.com/meersajidh/ru-soam/server/identity/internal/config"
	"github.com/meersajidh/ru-soam/server/identity/internal/model"
)

const rsaKeyBits = 2048

// Signer signs JWT claims and exposes the public key for verification / 11b.
//
// // KMSSigner — 11a.6: Cloud KMS-backed implementation of this interface.
type Signer interface {
	// Sign signs claims with RS256 and returns the compact JWT string.
	Sign(claims jwt.Claims) (string, error)

	// Public returns the RSA public key. Used by Verify and 11b token introspection.
	Public() *rsa.PublicKey
}

// PEMSigner implements Signer using an in-process RSA private key loaded from PEM.
type PEMSigner struct {
	private *rsa.PrivateKey
}

// NewPEMSigner builds a PEMSigner from cfg.
//
// Load order:
//  1. SigningKeyPEM (inline) — highest precedence.
//  2. SigningKeyPath (file).
//  3. DevEphemeral — generate ephemeral keypair, log WARN.
//  4. Hard-fail — a server that cannot sign is a misconfiguration, not a silent degrade.
func NewPEMSigner(cfg *config.JWTConfig) (*PEMSigner, error) {
	switch {
	case cfg.SigningKeyPEM != "":
		key, err := parseRSAPrivateKeyPEM([]byte(cfg.SigningKeyPEM))
		if err != nil {
			return nil, fmt.Errorf("signer: parse inline PEM key: %w", err)
		}
		return &PEMSigner{private: key}, nil

	case cfg.SigningKeyPath != "":
		b, err := os.ReadFile(cfg.SigningKeyPath)
		if err != nil {
			return nil, fmt.Errorf("signer: read key file %q: %w", cfg.SigningKeyPath, err)
		}
		key, err := parseRSAPrivateKeyPEM(b)
		if err != nil {
			return nil, fmt.Errorf("signer: parse key file %q: %w", cfg.SigningKeyPath, err)
		}
		return &PEMSigner{private: key}, nil

	case cfg.DevEphemeral:
		key, err := rsa.GenerateKey(rand.Reader, rsaKeyBits)
		if err != nil {
			return nil, fmt.Errorf("signer: generate ephemeral keypair: %w", err)
		}
		slog.Warn("[WARN] signer: ephemeral RS256 keypair in use — tokens are NOT valid across restarts; do NOT run in production")
		return &PEMSigner{private: key}, nil

	default:
		return nil, fmt.Errorf("signer: no signing key configured; " +
			"set JWT_SIGNING_KEY_PEM, JWT_SIGNING_KEY_PATH, or JWT_DEV_EPHEMERAL=true")
	}
}

// Sign signs claims with RS256 and returns the compact JWT string.
func (s *PEMSigner) Sign(claims jwt.Claims) (string, error) {
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signed, err := tok.SignedString(s.private)
	if err != nil {
		return "", fmt.Errorf("signer: sign JWT: %w", err)
	}
	return signed, nil
}

// Public returns the RSA public key.
func (s *PEMSigner) Public() *rsa.PublicKey {
	return &s.private.PublicKey
}

// Verify parses and validates a compact RS256 JWT, returning typed Claims.
// Returns an error when the signature is invalid, the token is expired, or
// the signing method is not RS256.
func Verify(tokenStr string, signer Signer) (*model.Claims, error) {
	var claims model.Claims
	tok, err := jwt.ParseWithClaims(tokenStr, &claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("signer: unexpected signing method %v — RS256 required", t.Header["alg"])
		}
		return signer.Public(), nil
	})
	if err != nil {
		return nil, fmt.Errorf("signer: verify: %w", err)
	}
	if !tok.Valid {
		return nil, fmt.Errorf("signer: token not valid")
	}
	return &claims, nil
}

// parseRSAPrivateKeyPEM decodes the first PEM block and parses PKCS#1 or PKCS#8 RSA keys.
func parseRSAPrivateKeyPEM(data []byte) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("no PEM block found")
	}
	switch block.Type {
	case "RSA PRIVATE KEY":
		return x509.ParsePKCS1PrivateKey(block.Bytes)
	case "PRIVATE KEY":
		raw, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("parse PKCS#8 key: %w", err)
		}
		key, ok := raw.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("PKCS#8 key is not RSA")
		}
		return key, nil
	default:
		return nil, fmt.Errorf("unsupported PEM type %q (expected RSA PRIVATE KEY or PRIVATE KEY)", block.Type)
	}
}
