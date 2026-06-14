package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/meersajidh/ru-soam/server/identity/internal/app"
	"github.com/meersajidh/ru-soam/server/identity/internal/config"
)

// Manual dependency injection — composition root is app.Build.
// Flow: config → logger → build → run (blocks on signal).
func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	logger := cfg.Logging.NewLogger()
	logger.Info("starting identity service", "port", cfg.Server.Port)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	application, closeStore, err := app.Build(ctx, cfg, logger)
	if err != nil {
		logger.Error("failed to build identity service", "error", err)
		os.Exit(1)
	}
	defer closeStore()

	if err := application.Run(ctx); err != nil {
		logger.Error("identity service stopped with error", "error", err)
		os.Exit(1)
	}
}
