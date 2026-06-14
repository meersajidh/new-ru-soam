// Package model contains data transfer objects shared across internal packages.
package model

import "github.com/golang-jwt/jwt/v5"

// Claims is the typed JWT payload issued by the identity service.
//
// sub = our account.ID (UUID) — NOT the Google sub. Session JWT is our
// credential; it is decoupled from Google's identifier (ADR-311 §4).
//
// entity_id mirrors account.EntityID when set; omitted when nil.
type Claims struct {
	// EntityID is the practitioner's entity UUID, populated once an entity_id
	// is bound to the account. Omitted from the token when nil.
	EntityID *string `json:"entity_id,omitempty"`

	jwt.RegisteredClaims
}
