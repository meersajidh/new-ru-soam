package app

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/meersajidh/ru-soam/server/identity/internal/config"
	"github.com/meersajidh/ru-soam/server/identity/internal/health"
	"github.com/meersajidh/ru-soam/server/identity/internal/rest"
	"github.com/meersajidh/ru-soam/server/identity/internal/session"
	"github.com/meersajidh/ru-soam/server/identity/internal/store"
)

// Build is the composition root: config → logger → store → handlers → router → App.
// No goroutines or servers are started here.
func Build(ctx context.Context, cfg *config.Config, logger *slog.Logger) (*App, func(), error) {
	var (
		accountStore store.AccountStore
		closeStore   func()
	)

	if cfg.DB.DatabaseURL != "" {
		pg, closeFn, err := store.NewPostgres(ctx, cfg.DB.DatabaseURL)
		if err != nil {
			return nil, nil, fmt.Errorf("build: init postgres store: %w", err)
		}
		accountStore = pg
		closeStore = closeFn
		logger.Info("postgres store connected")
	} else {
		// No DB configured — readiness will return 503; session upsert will 500.
		// Acceptable in dev without a DB.
		logger.Warn("no DATABASE_URL — running without postgres store")
		closeStore = func() {}
	}

	// Handlers
	healthHandler := health.New(accountStore) // nil accountStore → readiness 503
	sessionHandler := session.New(cfg.Google.ClientID, accountStore, logger)

	// Router
	router := rest.NewRouter(logger, cfg, healthHandler, sessionHandler)

	// HTTP server
	httpServer := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Server.Port),
		Handler:      router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}

	return NewApp(logger, httpServer), closeStore, nil
}
