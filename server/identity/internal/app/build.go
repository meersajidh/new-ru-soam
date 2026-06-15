package app

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/meersajidh/ru-soam/server/identity/internal/config"
	"github.com/meersajidh/ru-soam/server/identity/internal/health"
	"github.com/meersajidh/ru-soam/server/identity/internal/rest"
	"github.com/meersajidh/ru-soam/server/identity/internal/service"
	"github.com/meersajidh/ru-soam/server/identity/internal/session"
	"github.com/meersajidh/ru-soam/server/identity/internal/store"
)

// Build is the composition root: config → logger → store → signer → token service → handlers → router → App.
// No goroutines or servers are started here.
func Build(ctx context.Context, cfg *config.Config, logger *slog.Logger) (*App, func(), error) {
	// Consumer-interface-typed (declared by service/session/health). Left as nil
	// interfaces when no DB so the handlers' nil guards fire correctly — assign
	// only inside the DB block to avoid a non-nil interface wrapping a nil pointer.
	var (
		accountStore session.AccountStore
		refreshStore service.RefreshTokenStore
		eventStore   session.EventStore
		pinger       health.Pinger
		closeStore   func()
	)

	if cfg.DB.DatabaseURL != "" {
		pg, closeFn, err := store.NewPostgres(ctx, cfg.DB.DatabaseURL)
		if err != nil {
			return nil, nil, fmt.Errorf("build: init postgres store: %w", err)
		}
		accountStore = pg
		pinger = pg
		refreshStore = store.NewRefreshPostgres(pg.Pool())
		eventStore = store.NewSessionEventPostgres(pg.Pool())
		closeStore = closeFn
		logger.Info("postgres store connected")
	} else {
		// No DB configured — readiness will return 503; session upsert will 500.
		// Acceptable in dev without a DB.
		logger.Warn("no DATABASE_URL — running without postgres store")
		closeStore = func() {}
	}

	// Signer — hard-fail at boot if no key configured and JWT_DEV_EPHEMERAL not set.
	// A server that cannot sign JWTs is a misconfiguration, not a silent degrade.
	signer, err := service.NewPEMSigner(cfg.JWT)
	if err != nil {
		closeStore()
		return nil, nil, fmt.Errorf("build: init JWT signer: %w", err)
	}
	logger.Info("JWT signer initialised", "dev_ephemeral", cfg.JWT.DevEphemeral)

	// TokenService — requires signer + refreshStore; refreshStore is nil when no DB.
	// We only build TokenService when both are ready; the session handler guards
	// the no-DB path (tokens == nil → 500), so a nil TokenService is acceptable.
	var tokenSvc *service.TokenService
	if refreshStore != nil {
		tokenSvc = service.NewTokenService(
			signer,
			refreshStore,
			cfg.JWT.Issuer,
			cfg.JWT.AccessTTL,
			cfg.JWT.RefreshTTL,
		)
	} else {
		logger.Warn("no token store — POST /v1/session will return 500 (no DATABASE_URL)")
	}

	// Handlers
	healthHandler := health.New(pinger) // nil pinger → readiness 503
	sessionHandler := session.New(cfg.Google.ClientID, accountStore, tokenSvc, eventStore, logger)

	// Router
	router := rest.NewRouter(logger, cfg, signer, healthHandler, sessionHandler)

	// HTTP server
	httpServer := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Server.Port),
		Handler:      router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}

	return NewApp(logger, httpServer), closeStore, nil
}
