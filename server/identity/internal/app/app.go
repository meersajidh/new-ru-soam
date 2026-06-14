// Package app owns the running service lifecycle.
package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

const shutdownTimeout = 10 * time.Second

// App holds the HTTP server and the logger. Run blocks until the context is
// cancelled (SIGINT/SIGTERM), then shuts down gracefully.
type App struct {
	logger     *slog.Logger
	httpServer *http.Server
}

// NewApp creates an App.
func NewApp(logger *slog.Logger, httpServer *http.Server) *App {
	return &App{logger: logger, httpServer: httpServer}
}

// Run starts the HTTP server and blocks until ctx is done, then shuts down.
func (a *App) Run(ctx context.Context) error {
	runCtx, stop := context.WithCancel(ctx)
	defer stop()

	serverErr := make(chan error, 1)
	go func() {
		a.logger.Info("identity service listening", "addr", a.httpServer.Addr)
		if err := a.httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
			stop()
		}
	}()

	select {
	case <-runCtx.Done():
		a.logger.Info("shutdown signal received")
	case err := <-serverErr:
		return fmt.Errorf("server startup failed: %w", err)
	}

	return a.shutdown()
}

func (a *App) shutdown() error {
	a.logger.Info("shutting down gracefully", "timeout", shutdownTimeout)
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := a.httpServer.Shutdown(ctx); err != nil {
		return fmt.Errorf("http shutdown error: %w", err)
	}
	a.logger.Info("identity service stopped")
	return nil
}
