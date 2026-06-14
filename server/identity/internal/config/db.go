package config

import (
	"log/slog"
	"os"
)

// DBConfig holds Postgres connection settings.
// DATABASE_URL is the only required field (pgx connstring or postgres:// URL).
type DBConfig struct {
	// DatabaseURL is the pgx-compatible Postgres connection string.
	// Set via DATABASE_URL env var.
	// Example: postgres://user:pass@localhost:5432/identity?sslmode=disable
	DatabaseURL string
}

func loadDBConfig() *DBConfig {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		slog.Warn("DATABASE_URL is not set; Postgres store unavailable — readiness will report 503")
	}
	return &DBConfig{DatabaseURL: url}
}
