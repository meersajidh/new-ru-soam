package config

import (
	"log/slog"
	"os"
	"time"
)

const (
	defaultIssuer     = "ru-soam-identity"
	defaultAccessTTL  = 15 * time.Minute
	defaultRefreshTTL = 720 * time.Hour // 30 days
)

// JWTConfig holds settings for JWT issuance and the RS256 signing key.
// Key load order: SigningKeyPEM (inline) → SigningKeyPath (file) → DevEphemeral (warn) → hard-fail.
type JWTConfig struct {
	// Issuer is the JWT "iss" claim value. Defaults to "ru-soam-identity".
	// Set via JWT_ISSUER.
	Issuer string

	// AccessTTL is the lifetime of session JWTs. Default 15m.
	// Set via JWT_ACCESS_TTL (parsed with time.ParseDuration, e.g. "15m").
	AccessTTL time.Duration

	// RefreshTTL is the lifetime of refresh tokens. Default 720h (30d).
	// Set via JWT_REFRESH_TTL (e.g. "720h").
	RefreshTTL time.Duration

	// SigningKeyPEM is an inline PEM-encoded RSA private key.
	// Set via JWT_SIGNING_KEY_PEM. Takes precedence over SigningKeyPath.
	SigningKeyPEM string

	// SigningKeyPath is a path to a PKCS#1 or PKCS#8 PEM file.
	// Set via JWT_SIGNING_KEY_PATH.
	SigningKeyPath string

	// DevEphemeral, when true, generates an ephemeral in-memory RS256 keypair
	// at startup with a WARN log. Tokens issued with ephemeral keys are
	// invalidated on restart. NEVER use in production.
	// Set via JWT_DEV_EPHEMERAL=true.
	DevEphemeral bool

	// KMSKeyName is the full Cloud KMS CryptoKeyVersion resource name used for
	// RS256 JWT signing in production (11a.6).  When set, KMSSigner is used and
	// the PEM / DevEphemeral fields are ignored.
	//
	// Format: projects/P/locations/REGION/keyRings/R/cryptoKeys/K/cryptoKeyVersions/V
	//
	// Mutually exclusive with JWT_SIGNING_KEY_PEM, JWT_SIGNING_KEY_PATH, and
	// JWT_DEV_EPHEMERAL.  Set via JWT_KMS_KEY_NAME.
	KMSKeyName string
}

func loadJWTConfig() *JWTConfig {
	cfg := &JWTConfig{
		Issuer:         envOrDefault("JWT_ISSUER", defaultIssuer),
		AccessTTL:      parseDurationEnv("JWT_ACCESS_TTL", defaultAccessTTL),
		RefreshTTL:     parseDurationEnv("JWT_REFRESH_TTL", defaultRefreshTTL),
		SigningKeyPEM:  os.Getenv("JWT_SIGNING_KEY_PEM"),
		SigningKeyPath: os.Getenv("JWT_SIGNING_KEY_PATH"),
		DevEphemeral:   os.Getenv("JWT_DEV_EPHEMERAL") == "true",
		KMSKeyName:     os.Getenv("JWT_KMS_KEY_NAME"),
	}
	if cfg.KMSKeyName == "" && cfg.SigningKeyPEM == "" && cfg.SigningKeyPath == "" && !cfg.DevEphemeral {
		slog.Warn("no JWT signing key configured (JWT_SIGNING_KEY_PEM / JWT_SIGNING_KEY_PATH); " +
			"set JWT_DEV_EPHEMERAL=true for local dev — server will HARD FAIL at boot")
	}
	return cfg
}

// envOrDefault returns the env value when set, else def.
func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// parseDurationEnv parses env key as time.Duration; returns def on missing/invalid.
func parseDurationEnv(key string, def time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		slog.Warn("invalid duration env — using default", "key", key, "value", v, "default", def)
		return def
	}
	return d
}
