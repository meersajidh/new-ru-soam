package store_test

import (
	"regexp"
	"strings"
	"testing"

	"github.com/meersajidh/ru-soam/server/identity/internal/migrations"
)

// TestSessionEventsSchema_PHIFree reads the embedded 0003_session_events.sql
// migration and asserts:
//  1. The column set is a subset of the allowed operational columns.
//  2. No PHI or location columns are present.
//
// This test runs without a live database — it parses the embedded SQL text.
func TestSessionEventsSchema_PHIFree(t *testing.T) {
	t.Parallel()

	const migFile = "sql/0003_session_events.sql"
	data, err := migrations.FS.ReadFile(migFile)
	if err != nil {
		t.Fatalf("read migration %q: %v", migFile, err)
	}
	sql := string(data)

	// Extract only the CREATE TABLE ... ; block (Up section).
	// We scan lines between CREATE TABLE session_events ( and the matching );
	columns := extractColumnNames(t, sql)
	if len(columns) == 0 {
		t.Fatal("no columns found in session_events CREATE TABLE")
	}

	t.Logf("session_events columns: %v", columns)

	// Allowed operational columns — nothing else may appear.
	allowed := map[string]bool{
		"id":          true,
		"account_id":  true,
		"device_id":   true,
		"event_type":  true,
		"app_version": true,
		"created_at":  true,
	}

	// PHI / location denylist — must be disjoint with the column set.
	phiDenylist := []string{
		"email", "name", "given_name", "family_name", "picture",
		"ip", "ip_address", "user_agent",
		"location", "latitude", "longitude", "country", "region", "city",
		"fingerprint", "phone",
	}
	denySet := make(map[string]bool, len(phiDenylist))
	for _, col := range phiDenylist {
		denySet[col] = true
	}

	for _, col := range columns {
		if !allowed[col] {
			t.Errorf("unexpected column %q — not in allowed set for session_events", col)
		}
		if denySet[col] {
			t.Errorf("PHI/location column %q found in session_events — must not appear", col)
		}
	}
}

// extractColumnNames parses bare column names from a CREATE TABLE DDL block.
// It matches lines of the form:   <name>   <TYPE> ...
// inside the CREATE TABLE session_events ( ... ); block.
// Constraint lines (CHECK, UNIQUE, PRIMARY KEY as separate clause) are skipped.
func extractColumnNames(t *testing.T, sql string) []string {
	t.Helper()

	// Locate the CREATE TABLE block.
	start := strings.Index(strings.ToUpper(sql), "CREATE TABLE SESSION_EVENTS")
	if start < 0 {
		t.Fatal("CREATE TABLE session_events not found in migration")
	}
	block := sql[start:]

	// Find the opening paren.
	paren := strings.Index(block, "(")
	if paren < 0 {
		t.Fatal("opening '(' not found in CREATE TABLE block")
	}
	block = block[paren+1:]

	// Find the matching closing paren (depth-aware).
	depth := 1
	end := -1
	for i, ch := range block {
		switch ch {
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				end = i
			}
		}
		if end >= 0 {
			break
		}
	}
	if end < 0 {
		t.Fatal("closing ')' not found in CREATE TABLE block")
	}
	body := block[:end]

	// Match column definition lines: leading whitespace + identifier + whitespace + type keyword.
	// Skips standalone CONSTRAINT / CHECK / UNIQUE / PRIMARY KEY clause lines.
	colRe := regexp.MustCompile(`(?im)^\s{1,}([a-z_][a-z0-9_]*)\s+(UUID|TEXT|TIMESTAMPTZ|BIGINT|INT|BOOLEAN|NUMERIC|VARCHAR|CHAR|JSONB|BYTEA)\b`)
	var cols []string
	seen := map[string]bool{}
	for _, m := range colRe.FindAllStringSubmatch(body, -1) {
		name := strings.ToLower(m[1])
		if !seen[name] {
			seen[name] = true
			cols = append(cols, name)
		}
	}
	return cols
}
