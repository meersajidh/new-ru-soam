package app

import (
	"fmt"
	"log/slog"
	"net/http"

	"github.com/meersajidh/ru-soam/server/identity/internal/config"
	"github.com/meersajidh/ru-soam/server/identity/internal/health"
	"github.com/meersajidh/ru-soam/server/identity/internal/rest"
)

// Build is the composition root: config → logger → handlers → router → App.
// No goroutines or servers are started here.
func Build(cfg *config.Config, logger *slog.Logger) (*App, error) {
	// Handlers
	healthHandler := health.New()

	// Router
	router := rest.NewRouter(logger, cfg, healthHandler)

	// HTTP server
	httpServer := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Server.Port),
		Handler:      router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}

	return NewApp(logger, httpServer), nil
}
