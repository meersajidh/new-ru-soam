// Package config loads 12-factor configuration from environment variables.
// For local dev, joho/godotenv loads an optional .env file before env vars
// are read — it never fails if the file is absent.
package config

import (
	"log/slog"
	"os"

	"github.com/joho/godotenv"
)

// Config aggregates all service configuration.
type Config struct {
	Server  *ServerConfig
	Logging *LogConfig
}

// Load reads configuration from the environment.
// Loads .env if present (silently ignored when absent).
func Load() (*Config, error) {
	// Optional local .env — never fail when absent.
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		// Only log; don't fail — .env is optional.
		slog.Warn("godotenv: could not load .env", "err", err)
	}

	cfg := &Config{
		Server:  loadServerConfig(),
		Logging: loadLogConfig(),
	}
	return cfg, nil
}
