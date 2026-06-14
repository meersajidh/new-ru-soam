// Package health implements GET /health, /health/live, and /health/ready.
package health

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// Handler handles health probe requests.
type Handler struct{}

// New creates a Handler.
func New() *Handler { return &Handler{} }

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
func (h *Handler) Liveness(c *gin.Context) {
	c.JSON(http.StatusOK, newResp("ok"))
}

// Readiness handles GET /health/ready.
// In 11a.0 there are no downstream dependencies (no DB), so this is always ok.
func (h *Handler) Readiness(c *gin.Context) {
	c.JSON(http.StatusOK, newResp("ok"))
}
