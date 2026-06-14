package health_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/meersajidh/ru-soam/server/identity/internal/health"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// fakePinger implements health.Pinger for unit tests.
type fakePinger struct{ err error }

func (f *fakePinger) Ping(_ context.Context) error { return f.err }

func setupRouter(pinger health.Pinger) *gin.Engine {
	r := gin.New()
	h := health.New(pinger)
	r.GET("/health", h.Health)
	r.GET("/health/live", h.Liveness)
	r.GET("/health/ready", h.Readiness)
	return r
}

func TestHealth_ReturnsOK(t *testing.T) {
	r := setupRouter(&fakePinger{})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/health", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status=ok, got %v", body["status"])
	}
	if body["service"] != "identity" {
		t.Errorf("expected service=identity, got %v", body["service"])
	}
}

func TestLiveness_ReturnsOK(t *testing.T) {
	r := setupRouter(&fakePinger{})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/health/live", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status=ok, got %v", body["status"])
	}
}

func TestReadiness_ReturnsOK_WhenPingSucceeds(t *testing.T) {
	r := setupRouter(&fakePinger{err: nil})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/health/ready", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status=ok, got %v", body["status"])
	}
}

func TestReadiness_Returns503_WhenPingFails(t *testing.T) {
	r := setupRouter(&fakePinger{err: errors.New("connection refused")})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/health/ready", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body["status"] != "unavailable" {
		t.Errorf("expected status=unavailable, got %v", body["status"])
	}
}

func TestReadiness_Returns503_WhenNoDB(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/health/ready", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
}
