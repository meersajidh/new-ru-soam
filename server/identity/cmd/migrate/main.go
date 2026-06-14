// cmd/migrate runs goose migrations for the identity service.
//
// DATABASE_URL is read from the environment, or from a local .env in the
// working directory (server/identity), mirroring how the server boots.
//
// Usage (from server/identity):
//
//	go run ./cmd/migrate up        # DATABASE_URL from .env or env
//	go run ./cmd/migrate down
//	go run ./cmd/migrate status
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib" // pgx stdlib driver for database/sql
	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"

	"github.com/meersajidh/ru-soam/server/identity/internal/migrations"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: migrate <up|down|status|version|reset>")
		os.Exit(1)
	}
	command := os.Args[1]

	// Optional local .env (server/identity) — never fail when absent.
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		slog.Warn("godotenv: could not load .env", "err", err)
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		slog.Error("DATABASE_URL is required (set it in server/identity/.env or the environment)")
		os.Exit(1)
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		slog.Error("open db", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.PingContext(context.Background()); err != nil {
		slog.Error("ping db", "err", err)
		os.Exit(1)
	}

	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		slog.Error("goose set dialect", "err", err)
		os.Exit(1)
	}

	if err := goose.RunContext(context.Background(), command, db, "sql"); err != nil {
		slog.Error("goose run", "command", command, "err", err)
		os.Exit(1)
	}
}
