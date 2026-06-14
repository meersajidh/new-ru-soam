// Package error provides typed HTTP application errors and a gin JSON responder.
package error

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// AppError is a typed error with an HTTP status and a machine-readable code.
type AppError struct {
	// Status is the HTTP status code.
	Status int `json:"-"`
	// Code is a machine-readable error identifier.
	Code string `json:"code"`
	// Message is a human-readable description safe to return to callers.
	Message string `json:"message"`
}

func (e *AppError) Error() string {
	return e.Message
}

// NewInternal creates a 500 Internal Server Error.
func NewInternal(msg string) *AppError {
	return &AppError{Status: http.StatusInternalServerError, Code: "INTERNAL_ERROR", Message: msg}
}

// NewBadRequest creates a 400 Bad Request.
func NewBadRequest(msg string) *AppError {
	return &AppError{Status: http.StatusBadRequest, Code: "BAD_REQUEST", Message: msg}
}

// NewNotFound creates a 404 Not Found.
func NewNotFound(msg string) *AppError {
	return &AppError{Status: http.StatusNotFound, Code: "NOT_FOUND", Message: msg}
}

// NewUnauthorized creates a 401 Unauthorized.
func NewUnauthorized(msg string) *AppError {
	return &AppError{Status: http.StatusUnauthorized, Code: "UNAUTHORIZED", Message: msg}
}

// NewForbidden creates a 403 Forbidden.
func NewForbidden(msg string) *AppError {
	return &AppError{Status: http.StatusForbidden, Code: "FORBIDDEN", Message: msg}
}

// errorEnvelope is the JSON shape returned for errors.
type errorEnvelope struct {
	Error *AppError `json:"error"`
}

// Respond writes the AppError as a JSON HTTP response and aborts the gin chain.
func Respond(c *gin.Context, err *AppError) {
	c.AbortWithStatusJSON(err.Status, errorEnvelope{Error: err})
}
