package config

import (
	"os"
	"strings"
	"time"
)

// ServerConfig holds HTTP server settings.
type ServerConfig struct {
	// Port to listen on. Defaults to 8080; Cloud Run injects $PORT.
	Port string
	// ReadTimeout for the HTTP server.
	ReadTimeout time.Duration
	// WriteTimeout for the HTTP server.
	WriteTimeout time.Duration
	// AllowedOrigins is a pipe-separated list of CORS allowed origins.
	// Defaults to localhost origins for dev.
	AllowedOrigins string
}

func loadServerConfig() *ServerConfig {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	origins := os.Getenv("CORS_ALLOWED_ORIGINS")
	if origins == "" {
		origins = "http://localhost:3000|http://localhost:5173"
	}
	return &ServerConfig{
		Port:           port,
		ReadTimeout:    15 * time.Second,
		WriteTimeout:   15 * time.Second,
		AllowedOrigins: origins,
	}
}

// GetAllowedOrigins returns CORS origins as a slice.
func (c *ServerConfig) GetAllowedOrigins() []string {
	return strings.Split(c.AllowedOrigins, "|")
}
