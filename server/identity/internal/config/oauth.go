package config

import (
	"log/slog"
	"os"
)

// GoogleConfig holds Google OAuth2 settings needed for ID-token verification.
// ClientID is the Desktop-app OAuth client id used as the audience when
// verifying Google ID tokens (ADR-311 §3: server verifies ID-token only).
type GoogleConfig struct {
	// ClientID is the Google OAuth2 client ID (audience for ID-token verification).
	// Set via GOOGLE_CLIENT_ID env var.
	ClientID string
}

func loadGoogleConfig() *GoogleConfig {
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	if clientID == "" {
		slog.Warn("GOOGLE_CLIENT_ID is not set; real Google ID tokens will be rejected")
	}
	return &GoogleConfig{ClientID: clientID}
}
