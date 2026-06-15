// Package session implements POST /v1/session, POST /v1/refresh, POST /v1/revoke.
package session

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

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
	IDToken string `json:"id_token"`
	// DeviceID and AppVersion removed — telemetry decoupled to POST /v1/events (Phase β / O468).
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
	// DeviceID and AppVersion removed — telemetry decoupled to POST /v1/events (Phase β / O468).
}

type revokeRequest struct {
	RefreshToken string `json:"refresh_token"`
	// DeviceID and AppVersion removed — telemetry decoupled to POST /v1/events (Phase β / O468).
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
	// Telemetry (login event) decoupled to POST /v1/events (Phase β / O468).

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

	tokens, _, err := h.tokens.Rotate(c.Request.Context(), req.RefreshToken)
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
	// Telemetry (refresh event) decoupled to POST /v1/events (Phase β / O468).

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

	_, err := h.tokens.Revoke(c.Request.Context(), req.RefreshToken)
	if err != nil {
		h.logger.ErrorContext(c.Request.Context(), "revoke failed", "err", err)
		apperror.Respond(c, apperror.NewInternal("revoke failed"))
		return
	}
	// Telemetry (signout event) decoupled to POST /v1/events (Phase β / O468).

	c.Status(http.StatusOK)
}

// ── Telemetry ingest ─────────────────────────────────────────────────────────

// eventsRequest is the body for POST /v1/events.
type eventsRequest struct {
	Events []eventItem `json:"events"`
}

type eventItem struct {
	// EventType must be one of EventLogin / EventRefresh / EventSignout.
	EventType string `json:"event_type"`
	// DeviceID and AppVersion are optional analytics fields — stored as SQL NULL when absent.
	DeviceID   string `json:"device_id,omitempty"`
	AppVersion string `json:"app_version,omitempty"`
	// NOTE: no occurred_at accepted — server stamps created_at=now() via Record.
	// Late-flushed offline-queued events therefore carry receipt-time, not
	// occurrence-time. Accepted coarse-analytics tradeoff (Phase β.2 flush design).
}

// validEventTypes is the closed set of accepted event_type values.
var validEventTypes = map[string]struct{}{
	EventLogin:   {},
	EventRefresh: {},
	EventSignout: {},
}

// maxEventsPerBatch caps the batch size to bound abuse.
const maxEventsPerBatch = 100

// RecordEvents handles POST /v1/events.
//
// account_id is derived solely from the session JWT set by requireSession middleware;
// it is never accepted from the request body — the JWT is the identity authority.
func (h *Handler) RecordEvents(c *gin.Context) {
	if h.events == nil {
		// EventStore not configured (no DB). Log and return 503 so the client
		// can distinguish "server ok" from "telemetry unavailable".
		h.logger.WarnContext(c.Request.Context(), "RecordEvents: event store not configured")
		apperror.Respond(c, apperror.NewInternal("telemetry store not available"))
		return
	}

	accountID := c.GetString("account_id")
	if accountID == "" {
		// Should not reach here — requireSession sets it; guard for safety.
		apperror.Respond(c, apperror.NewUnauthorized("authentication required"))
		return
	}

	var req eventsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apperror.Respond(c, apperror.NewBadRequest("invalid request body"))
		return
	}
	if len(req.Events) == 0 {
		apperror.Respond(c, apperror.NewBadRequest("events must not be empty"))
		return
	}
	if len(req.Events) > maxEventsPerBatch {
		apperror.Respond(c, apperror.NewBadRequest("too many events in batch (max 100)"))
		return
	}

	// Validate all event_types before recording any — fast-fail on bad input.
	for i, ev := range req.Events {
		if _, ok := validEventTypes[ev.EventType]; !ok {
			apperror.Respond(c, apperror.NewBadRequest(
				"events["+strconv.Itoa(i)+"]: unknown event_type "+ev.EventType+
					"; must be login, refresh, or signout",
			))
			return
		}
	}

	// Record best-effort: log individual failures, do NOT abort the whole batch.
	for _, ev := range req.Events {
		h.recordEvent(c, accountID, ev.DeviceID, ev.EventType, ev.AppVersion)
	}

	c.Status(http.StatusNoContent)
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
