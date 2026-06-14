// Package rest wires gin router, middleware, and route groups.
package rest

import (
	"log/slog"

	"github.com/gin-gonic/gin"

	"github.com/meersajidh/ru-soam/server/identity/internal/config"
	"github.com/meersajidh/ru-soam/server/identity/internal/health"
)

// NewRouter builds and returns a configured *gin.Engine.
// Gin debug mode is suppressed; structured access-log middleware replaces it.
func NewRouter(logger *slog.Logger, cfg *config.Config, healthHandler *health.Handler) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)

	r := gin.New()
	r.Use(
		recoveryMiddleware(logger),
		accessLogMiddleware(logger),
		corsMiddleware(cfg.Server.GetAllowedOrigins()),
	)

	registerHealthRoutes(r, healthHandler)

	return r
}

func registerHealthRoutes(r *gin.Engine, h *health.Handler) {
	r.GET(HealthRoute, h.Health)
	r.GET(LivenessRoute, h.Liveness)
	r.GET(ReadinessRoute, h.Readiness)
}
