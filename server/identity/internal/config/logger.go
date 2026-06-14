package config

import (
	"log/slog"
	"os"
)

// LogConfig holds logging configuration.
type LogConfig struct {
	Level  string
	Format string
}

const (
	defaultLogLevel  = "INFO"
	defaultLogFormat = "json"
)

// loadLogConfig reads LOG_LEVEL and LOG_FORMAT from env with sane defaults.
func loadLogConfig() *LogConfig {
	level := os.Getenv("LOG_LEVEL")
	if level == "" {
		level = defaultLogLevel
	}
	format := os.Getenv("LOG_FORMAT")
	if format == "" {
		format = defaultLogFormat
	}
	return &LogConfig{Level: level, Format: format}
}

// level converts the config string to slog.Level.
func (c *LogConfig) level() slog.Level {
	switch c.Level {
	case "DEBUG":
		return slog.LevelDebug
	case "WARN":
		return slog.LevelWarn
	case "ERROR":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// NewLogger builds a *slog.Logger from this config.
func (c *LogConfig) NewLogger() *slog.Logger {
	opts := &slog.HandlerOptions{Level: c.level()}
	if c.Format == "json" || c.Format == "JSON" {
		return slog.New(slog.NewJSONHandler(os.Stdout, opts))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, opts))
}
