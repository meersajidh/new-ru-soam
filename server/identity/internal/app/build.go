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
	var (
		accountStore store.AccountStore
		tokenStore   store.RefreshTokenStore
		closeStore   func()
	)

	if cfg.DB.DatabaseURL != "" {
		pg, closeFn, err := store.NewPostgres(ctx, cfg.DB.DatabaseURL)
		if err != nil {
			return nil, nil, fmt.Errorf("build: init postgres store: %w", err)
		}
		accountStore = pg
		tokenStore = store.NewRefreshPostgres(pg.Pool())
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

	// TokenService — requires signer + tokenStore; tokenStore may be nil when no DB.
	// When tokenStore is nil the TokenService will panic at runtime on any call —
	// that is acceptable: the session handler already guards the no-DB path (store==nil → 500).
	// We only build TokenService when both are ready.
	var tokenSvc *service.TokenService
	if tokenStore != nil {
		tokenSvc = service.NewTokenService(
			signer,
			tokenStore,
			cfg.JWT.Issuer,
			cfg.JWT.AccessTTL,
			cfg.JWT.RefreshTTL,
		)
	} else {
		logger.Warn("no token store — POST /v1/session will return 500 (no DATABASE_URL)")
	}

	// Handlers
	healthHandler := health.New(accountStore) // nil accountStore → readiness 503
	sessionHandler := session.New(cfg.Google.ClientID, accountStore, tokenSvc, logger)

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
