// cmd/migrate runs goose migrations for the identity service.
//
// Usage:
//
//	DATABASE_URL=postgres://... go run ./cmd/migrate up
//	DATABASE_URL=postgres://... go run ./cmd/migrate down
//	DATABASE_URL=postgres://... go run ./cmd/migrate status
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib" // pgx stdlib driver for database/sql
	"github.com/pressly/goose/v3"

	"github.com/meersajidh/ru-soam/server/identity/internal/migrations"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: migrate <up|down|status|version|reset>")
		os.Exit(1)
	}
	command := os.Args[1]

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		slog.Error("DATABASE_URL is required")
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
