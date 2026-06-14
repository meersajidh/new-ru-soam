// Package migrations embeds the goose SQL migration files so they can be used
// from any package (including cmd/migrate) without path resolution issues.
package migrations

import "embed"

// FS holds all *.sql files from the migrations/ directory at the module root.
//
//go:embed sql/*.sql
var FS embed.FS
