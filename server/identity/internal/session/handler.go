// Package session implements POST /v1/session — Google ID-token verification.
package session

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	apperror "github.com/meersajidh/ru-soam/server/identity/internal/error"
	"github.com/meersajidh/ru-soam/server/identity/internal/service"
	"github.com/meersajidh/ru-soam/server/identity/internal/store"
)

// Handler handles session requests.
type Handler struct {
	audience string
	store    store.AccountStore
	logger   *slog.Logger
}

// New creates a Handler.
// audience is the Google OAuth2 client ID used as the JWT audience (GOOGLE_CLIENT_ID).
// httpClient is unused at this layer — service.VerifyIDToken accepts nil → DefaultClient.
func New(audience string, accountStore store.AccountStore, logger *slog.Logger) *Handler {
	return &Handler{audience: audience, store: accountStore, logger: logger}
}

type sessionRequest struct {
	IDToken string `json:"id_token"`
}

// sessionResponse is the 11a.2 shape.
// 11a.3 replaces this with {access_token, refresh_token, expires_in}.
type sessionResponse struct {
	AccountID string `json:"account_id"`
	Sub       string `json:"sub"`
	Email     string `json:"email"`
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

	if h.store == nil {
		h.logger.ErrorContext(c.Request.Context(), "account store not configured", "sub", id.GoogleSub)
		apperror.Respond(c, apperror.NewInternal("account store not available"))
		return
	}

	acc, err := h.store.UpsertByGoogleSub(c.Request.Context(), id.GoogleSub, id.Email)
	if err != nil {
		// Log sub for ops; never log email in error path.
		h.logger.ErrorContext(c.Request.Context(), "account upsert failed", "sub", id.GoogleSub, "err", err)
		apperror.Respond(c, apperror.NewInternal("account registration failed"))
		return
	}

	h.logger.InfoContext(c.Request.Context(), "account upserted", "account_id", acc.ID, "sub", acc.GoogleSub)

	c.JSON(http.StatusOK, sessionResponse{
		AccountID: acc.ID,
		Sub:       acc.GoogleSub,
		Email:     acc.Email,
	})
}
