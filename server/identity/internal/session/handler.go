// Package session implements POST /v1/session, POST /v1/refresh, POST /v1/revoke.
package session

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	apperror "github.com/meersajidh/ru-soam/server/identity/internal/error"
	"github.com/meersajidh/ru-soam/server/identity/internal/service"
)

// Handler handles session requests.
type Handler struct {
	audience string
	store    AccountStore
	tokens   *service.TokenService
	events   EventStore // nil-safe: telemetry skipped when nil
	logger   *slog.Logger
}

// New creates a Handler.
// audience is the Google OAuth2 client ID used as the JWT audience (GOOGLE_CLIENT_ID).
// tokens may be nil when no signing key is configured; CreateSession returns 500.
// events may be nil (no DB, or explicitly disabled); telemetry is then skipped.
func New(audience string, accountStore AccountStore, tokens *service.TokenService, events EventStore, logger *slog.Logger) *Handler {
	return &Handler{audience: audience, store: accountStore, tokens: tokens, events: events, logger: logger}
}

// ── Request / Response shapes ─────────────────────────────────────────────────

type sessionRequest struct {
	IDToken    string `json:"id_token"`
	DeviceID   string `json:"device_id"`
	AppVersion string `json:"app_version"`
}

// tokenResponse is the 11a.3 shape returned by /v1/session and /v1/refresh.
type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
	DeviceID     string `json:"device_id"`
	AppVersion   string `json:"app_version"`
}

type revokeRequest struct {
	RefreshToken string `json:"refresh_token"`
	DeviceID     string `json:"device_id"`
	AppVersion   string `json:"app_version"`
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// CreateSession handles POST /v1/session.
// Verifies the Google ID token, upserts the account, and issues tokens.
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
		h.logger.ErrorContext(c.Request.Context(), "account upsert failed", "sub", id.GoogleSub, "err", err)
		apperror.Respond(c, apperror.NewInternal("account registration failed"))
		return
	}

	if h.tokens == nil {
		h.logger.ErrorContext(c.Request.Context(), "token service not configured — missing signing key", "account_id", acc.ID)
		apperror.Respond(c, apperror.NewInternal("token service not available"))
		return
	}

	tokens, err := h.tokens.IssueForAccount(c.Request.Context(), acc)
	if err != nil {
		h.logger.ErrorContext(c.Request.Context(), "token issuance failed", "account_id", acc.ID, "err", err)
		apperror.Respond(c, apperror.NewInternal("token issuance failed"))
		return
	}

	h.logger.InfoContext(c.Request.Context(), "session created", "account_id", acc.ID)
	h.recordEvent(c, acc.ID, req.DeviceID, EventLogin, req.AppVersion)

	c.JSON(http.StatusOK, tokenResponse{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		ExpiresIn:    tokens.ExpiresIn,
		TokenType:    tokens.TokenType,
	})
}

// RefreshSession handles POST /v1/refresh.
// Rotates the refresh token and issues a fresh access JWT.
// Reuse (replay of an already-consumed token) revokes the entire family and returns 401.
func (h *Handler) RefreshSession(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.RefreshToken == "" {
		apperror.Respond(c, apperror.NewBadRequest("refresh_token is required"))
		return
	}

	if h.tokens == nil {
		apperror.Respond(c, apperror.NewInternal("token service not available"))
		return
	}

	tokens, accountID, err := h.tokens.Rotate(c.Request.Context(), req.RefreshToken)
	if err != nil {
		if errors.Is(err, service.ErrInvalidGrant) || errors.Is(err, service.ErrReuse) {
			h.logger.WarnContext(c.Request.Context(), "refresh rejected", "reason", err.Error())
			apperror.Respond(c, apperror.NewUnauthorized("invalid_grant"))
			return
		}
		h.logger.ErrorContext(c.Request.Context(), "refresh rotation failed", "err", err)
		apperror.Respond(c, apperror.NewInternal("refresh failed"))
		return
	}

	h.recordEvent(c, accountID, req.DeviceID, EventRefresh, req.AppVersion)

	c.JSON(http.StatusOK, tokenResponse{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		ExpiresIn:    tokens.ExpiresIn,
		TokenType:    tokens.TokenType,
	})
}

// RevokeSession handles POST /v1/revoke.
// Revokes the token family. Unknown tokens return 200 (idempotent).
func (h *Handler) RevokeSession(c *gin.Context) {
	var req revokeRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.RefreshToken == "" {
		apperror.Respond(c, apperror.NewBadRequest("refresh_token is required"))
		return
	}

	if h.tokens == nil {
		apperror.Respond(c, apperror.NewInternal("token service not available"))
		return
	}

	accountID, err := h.tokens.Revoke(c.Request.Context(), req.RefreshToken)
	if err != nil {
		h.logger.ErrorContext(c.Request.Context(), "revoke failed", "err", err)
		apperror.Respond(c, apperror.NewInternal("revoke failed"))
		return
	}

	// Only record signout when a known family was revoked (accountID non-empty).
	if accountID != "" {
		h.recordEvent(c, accountID, req.DeviceID, EventSignout, req.AppVersion)
	}

	c.Status(http.StatusOK)
}

// ── helpers ───────────────────────────────────────────────────────────────────

// recordEvent records a telemetry event best-effort.
// If events is nil or Record returns an error, a warning is logged and execution
// continues — telemetry MUST NOT block or fail the auth response.
func (h *Handler) recordEvent(c *gin.Context, accountID, deviceID, eventType, appVersion string) {
	if h.events == nil {
		return
	}
	if err := h.events.Record(c.Request.Context(), accountID, deviceID, eventType, appVersion); err != nil {
		h.logger.WarnContext(c.Request.Context(), "session event record failed (best-effort)",
			"event_type", eventType, "account_id", accountID, "err", err)
	}
}
