// Package service contains domain-level business logic for the identity service.
package service

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// googleCertsURL is a var so tests can point it at an httptest server.
var googleCertsURL = "https://www.googleapis.com/oauth2/v3/certs"

const jwksTTL = time.Hour

// Identity is the verified practitioner identity extracted from a Google ID token.
type Identity struct {
	GoogleSub string
	Email     string
	Name      string
	Picture   string
}

type googleClaims struct {
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
	jwt.RegisteredClaims
}

// VerifyIDToken verifies a raw Google ID token and returns the practitioner's identity.
// httpClient may be nil; http.DefaultClient is used in that case.
func VerifyIDToken(ctx context.Context, httpClient *http.Client, rawIDToken string, audience string) (Identity, error) {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return validateGoogleIDToken(ctx, httpClient, rawIDToken, audience)
}

func validateGoogleIDToken(ctx context.Context, client *http.Client, rawToken, audience string) (Identity, error) {
	kid, err := jwtKID(rawToken)
	if err != nil {
		return Identity{}, err
	}
	pub, err := sharedJWKSCache.get(ctx, client, kid)
	if err != nil {
		return Identity{}, err
	}

	var claims googleClaims
	_, err = jwt.ParseWithClaims(rawToken, &claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("google: unexpected signing method %v", t.Header["alg"])
		}
		return pub, nil
	}, jwt.WithAudience(audience))
	if err != nil {
		return Identity{}, fmt.Errorf("google: validate id_token: %w", err)
	}
	if claims.Issuer != "accounts.google.com" && claims.Issuer != "https://accounts.google.com" {
		return Identity{}, fmt.Errorf("google: unexpected issuer %q", claims.Issuer)
	}
	if claims.Subject == "" || claims.Email == "" {
		return Identity{}, fmt.Errorf("google: missing sub or email in id_token")
	}
	return Identity{
		GoogleSub: claims.Subject,
		Email:     claims.Email,
		Name:      claims.Name,
		Picture:   claims.Picture,
	}, nil
}

// jwtKID decodes the JWT header and returns the kid claim without verifying the signature.
func jwtKID(rawToken string) (string, error) {
	parts := strings.SplitN(rawToken, ".", 3)
	if len(parts) != 3 {
		return "", fmt.Errorf("google: malformed id_token")
	}
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", fmt.Errorf("google: decode token header: %w", err)
	}
	var h struct {
		Kid string `json:"kid"`
	}
	if err := json.Unmarshal(headerJSON, &h); err != nil {
		return "", fmt.Errorf("google: parse token header: %w", err)
	}
	if h.Kid == "" {
		return "", fmt.Errorf("google: missing kid in token header")
	}
	return h.Kid, nil
}

// jwksCache caches Google's RSA public keys with a TTL.
type jwksCache struct {
	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

var sharedJWKSCache = &jwksCache{}

func (c *jwksCache) get(ctx context.Context, client *http.Client, kid string) (*rsa.PublicKey, error) {
	c.mu.RLock()
	if time.Since(c.fetchedAt) < jwksTTL {
		if key, ok := c.keys[kid]; ok {
			c.mu.RUnlock()
			return key, nil
		}
	}
	c.mu.RUnlock()

	c.mu.Lock()
	defer c.mu.Unlock()

	// Re-check after acquiring write lock (another goroutine may have refreshed).
	if time.Since(c.fetchedAt) < jwksTTL {
		if key, ok := c.keys[kid]; ok {
			return key, nil
		}
	}

	if err := c.fetch(ctx, client); err != nil {
		return nil, err
	}
	key, ok := c.keys[kid]
	if !ok {
		return nil, fmt.Errorf("google: no JWKS key for kid %q", kid)
	}
	return key, nil
}

func (c *jwksCache) fetch(ctx context.Context, client *http.Client) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleCertsURL, nil)
	if err != nil {
		return fmt.Errorf("google: build certs request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("google: fetch certs: %w", err)
	}
	defer resp.Body.Close()

	var jwks struct {
		Keys []struct {
			Kid string `json:"kid"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return fmt.Errorf("google: decode certs: %w", err)
	}

	fresh := make(map[string]*rsa.PublicKey, len(jwks.Keys))
	for _, k := range jwks.Keys {
		pub, err := jwkRSAKey(k.N, k.E)
		if err != nil {
			continue
		}
		fresh[k.Kid] = pub
	}
	c.keys = fresh
	c.fetchedAt = time.Now()
	return nil
}

func jwkRSAKey(nB64, eB64 string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nB64)
	if err != nil {
		return nil, fmt.Errorf("google: decode n: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(eB64)
	if err != nil {
		return nil, fmt.Errorf("google: decode e: %w", err)
	}
	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: int(new(big.Int).SetBytes(eBytes).Int64()),
	}, nil
}
