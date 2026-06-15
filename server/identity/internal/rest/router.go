// Package rest wires gin router, middleware, and route groups.
package rest

import (
	"log/slog"

	"github.com/gin-gonic/gin"

	"github.com/meersajidh/ru-soam/server/identity/internal/config"
	"github.com/meersajidh/ru-soam/server/identity/internal/health"
	"github.com/meersajidh/ru-soam/server/identity/internal/service"
	"github.com/meersajidh/ru-soam/server/identity/internal/session"
)

// NewRouter builds and returns a configured *gin.Engine.
// Gin debug mode is suppressed; structured access-log middleware replaces it.
//
// signer and issuer are required to mount the requireSession middleware on the
// authed route group (POST /v1/events). All existing unauthenticated routes
// (health / session / refresh / revoke) are unaffected.
func NewRouter(logger *slog.Logger, cfg *config.Config, signer service.Signer, healthHandler *health.Handler, sessionHandler *session.Handler) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)

	r := gin.New()
	r.Use(
		recoveryMiddleware(logger),
		accessLogMiddleware(logger),
		corsMiddleware(cfg.Server.GetAllowedOrigins()),
	)

	registerHealthRoutes(r, healthHandler)
	registerSessionRoutes(r, sessionHandler)
	registerAuthedRoutes(r, signer, cfg.JWT.Issuer, sessionHandler)

	return r
}

func registerHealthRoutes(r *gin.Engine, h *health.Handler) {
	r.GET(HealthRoute, h.Health)
	r.GET(LivenessRoute, h.Liveness)
	r.GET(ReadinessRoute, h.Readiness)
}

func registerSessionRoutes(r *gin.Engine, h *session.Handler) {
	r.POST(SessionRoute, h.CreateSession)
	r.POST(RefreshRoute, h.RefreshSession)
	r.POST(RevokeRoute, h.RevokeSession)
}

func registerAuthedRoutes(r *gin.Engine, signer service.Signer, issuer string, h *session.Handler) {
	authed := r.Group("/", requireSession(signer, issuer))
	authed.POST(EventsRoute, h.RecordEvents)
}
