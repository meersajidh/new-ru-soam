// Package health implements GET /health, /health/live, and /health/ready.
package health

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// Pinger is the minimal interface the readiness probe needs — satisfied by
// store.AccountStore (which has Ping) and by test fakes.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Handler handles health probe requests.
type Handler struct {
	db Pinger // nil when running without a DB (e.g. 11a.0 or misconfigured dev)
}

// New creates a Handler. db may be nil; readiness will return 503 when nil.
func New(db Pinger) *Handler { return &Handler{db: db} }

type healthResponse struct {
	Status    string `json:"status"`
	Service   string `json:"service"`
	Timestamp string `json:"timestamp"`
}

func newResp(status string) healthResponse {
	return healthResponse{
		Status:    status,
		Service:   "identity",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
}

// Health handles GET /health.
func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, newResp("ok"))
}

// Liveness handles GET /health/live.
// Dependency-free: service process alive → 200.
func (h *Handler) Liveness(c *gin.Context) {
	c.JSON(http.StatusOK, newResp("ok"))
}

// Readiness handles GET /health/ready.
// Returns 503 when the DB is unreachable or not configured.
func (h *Handler) Readiness(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, newResp("unavailable"))
		return
	}
	if err := h.db.Ping(c.Request.Context()); err != nil {
		c.JSON(http.StatusServiceUnavailable, newResp("unavailable"))
		return
	}
	c.JSON(http.StatusOK, newResp("ok"))
}
