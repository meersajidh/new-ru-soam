// Package session implements POST /v1/session — Google ID-token verification.
package session

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	apperror "github.com/meersajidh/ru-soam/server/identity/internal/error"
	"github.com/meersajidh/ru-soam/server/identity/internal/service"
)

// Handler handles session requests.
type Handler struct {
	audience string
	logger   *slog.Logger
}

// New creates a Handler.
// audience is the Google OAuth2 client ID used as the JWT audience (GOOGLE_CLIENT_ID).
// httpClient is unused at this layer — service.VerifyIDToken accepts nil → DefaultClient.
func New(audience string, logger *slog.Logger) *Handler {
	return &Handler{audience: audience, logger: logger}
}

type sessionRequest struct {
	IDToken string `json:"id_token"`
}

// sessionResponse is the provisional 11a.1 shape.
// 11a.2 adds account fields; 11a.3 replaces this with {access_token, refresh_token}.
type sessionResponse struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
}

// CreateSession handles POST /v1/session.
func (h *Handler) CreateSession(c *gin.Context) {
	var req sessionRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.IDToken == "" {
		apperror.Respond(c, apperror.NewBadRequest("id_token is required"))
		return
	}

	id, err := service.VerifyIDToken(c.Request.Context(), nil, req.IDToken, h.audience)
	if err != nil {
		h.logger.WarnContext(c.Request.Context(), "id_token verification failed", "err", err)
		apperror.Respond(c, apperror.NewUnauthorized("invalid id_token"))
		return
	}

	c.JSON(http.StatusOK, sessionResponse{
		Sub:   id.GoogleSub,
		Email: id.Email,
	})
}
