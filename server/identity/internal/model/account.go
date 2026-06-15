// Package model contains data transfer objects shared across internal packages.
package model

import "time"

// Account represents a registered practitioner account.
// Structurally PHI-free: no clinical columns, no name/picture (domain user-profile
// lives in the Local Store — ADR-311 §6).
type Account struct {
	ID        string     `json:"id"`
	GoogleSub string     `json:"google_sub"`
	Email     string     `json:"email"`
	EntityID  *string    `json:"entity_id,omitempty"`
	Status    string     `json:"status"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}
