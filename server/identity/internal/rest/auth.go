package rest

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	apperror "github.com/meersajidh/ru-soam/server/identity/internal/error"
	"github.com/meersajidh/ru-soam/server/identity/internal/model"
	"github.com/meersajidh/ru-soam/server/identity/internal/service"
)

const contextKeyAccountID = "account_id"

// requireSession verifies a Bearer session JWT issued by this service.
//
// Checks enforced:
//   - Authorization header present and well-formed ("Bearer <token>").
//   - Signing method is RS256 — rejects alg-confusion (e.g. HS256).
//   - Signature valid against signer.Public().
//   - Token not expired (golang-jwt validates exp automatically).
//   - Issuer matches the configured issuer.
//
// On success sets c["account_id"] = claims.Subject and calls c.Next().
// On any failure aborts with 401 — no hint which specific check failed.
func requireSession(signer service.Signer, issuer string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			apperror.Respond(c, apperror.NewUnauthorized("authentication required"))
			return
		}
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		var claims model.Claims
		tok, err := jwt.ParseWithClaims(tokenStr, &claims, func(t *jwt.Token) (any, error) {
			// Enforce RS256 — reject alg-confusion attacks (e.g. none/HS256).
			if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, apperror.NewUnauthorized("authentication required")
			}
			return signer.Public(), nil
		}, jwt.WithIssuer(issuer), jwt.WithValidMethods([]string{"RS256"}))

		if err != nil || !tok.Valid {
			apperror.Respond(c, apperror.NewUnauthorized("authentication required"))
			return
		}

		c.Set(contextKeyAccountID, claims.Subject)
		c.Next()
	}
}
