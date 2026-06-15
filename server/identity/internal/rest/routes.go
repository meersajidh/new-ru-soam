package rest

// Route path constants.
const (
	HealthRoute    = "/health"
	LivenessRoute  = "/health/live"
	ReadinessRoute = "/health/ready"

	// Session routes (11a.1+).
	SessionRoute = "/v1/session"

	// Token rotation / revocation routes (11a.3+).
	RefreshRoute = "/v1/refresh"
	RevokeRoute  = "/v1/revoke"

	// Telemetry ingest route (11a.5b / Phase β.1+).
	// Requires a valid session JWT (requireSession middleware).
	EventsRoute = "/v1/events"

	// Account lifecycle (ADR-311 Amendment 2 / O477).
	// Refresh-token-authenticated (no requireSession — mirrors RevokeRoute).
	AccountDeleteRoute = "/v1/account/delete"
)
