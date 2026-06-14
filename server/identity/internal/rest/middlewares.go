package rest

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperror "github.com/meersajidh/ru-soam/server/identity/internal/error"
)

// recoveryMiddleware catches panics, logs them, and returns 500.
func recoveryMiddleware(logger *slog.Logger) gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered any) {
		logger.ErrorContext(c.Request.Context(), "panic recovered",
			"recovered", recovered,
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
		)
		apperror.Respond(c, apperror.NewInternal("an unexpected error occurred"))
	})
}

// accessLogMiddleware logs each request with request_id, method, path, status, latency.
func accessLogMiddleware(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = uuid.NewString()
		}
		c.Header("X-Request-ID", requestID)

		c.Next()

		logger.InfoContext(c.Request.Context(), "request",
			"request_id", requestID,
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"latency_ms", time.Since(start).Milliseconds(),
			"client_ip", c.ClientIP(),
		)
	}
}

// corsMiddleware applies simple CORS headers for the configured allowed origins.
// Only handles actual requests — no preflight OPTIONS route needed for health-only 11a.0.
func corsMiddleware(allowedOrigins []string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = struct{}{}
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			if _, ok := allowed[origin]; ok {
				c.Header("Access-Control-Allow-Origin", origin)
				c.Header("Vary", "Origin")
			}
		}
		if c.Request.Method == http.MethodOptions {
			c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Request-ID")
			c.Header("Access-Control-Max-Age", "43200")
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
