// Package service contains domain-level business logic for the identity service.
package service

import (
	"context"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"

	kms "cloud.google.com/go/kms/apiv1"
	"cloud.google.com/go/kms/apiv1/kmspb"
	"github.com/golang-jwt/jwt/v5"
	gax "github.com/googleapis/gax-go/v2"
)

// kmsClient is the subset of *kms.KeyManagementClient used by KMSSigner.
// Defined as an interface so unit tests can inject a fake without a live GCP project.
type kmsClient interface {
	AsymmetricSign(ctx context.Context, req *kmspb.AsymmetricSignRequest, opts ...gax.CallOption) (*kmspb.AsymmetricSignResponse, error)
	GetPublicKey(ctx context.Context, req *kmspb.GetPublicKeyRequest, opts ...gax.CallOption) (*kmspb.PublicKey, error)
}

// KMSSigner implements Signer using Cloud KMS for each RS256 sign operation.
// The RSA private key never leaves KMS; only the digest is sent per Sign call.
// The public key is fetched once at construction and cached for the process lifetime.
type KMSSigner struct {
	client  kmsClient
	keyName string // full CryptoKeyVersion resource name
	pubKey  *rsa.PublicKey
}

// NewKMSSigner constructs a KMSSigner.
//
// keyName must be a full Cloud KMS CryptoKeyVersion resource name:
//
//	projects/P/locations/REGION/keyRings/R/cryptoKeys/K/cryptoKeyVersions/V
//
// The constructor fetches and caches the public key from KMS; it hard-fails if
// the key is not an RSA key (algorithm RSA_SIGN_PKCS1_2048_SHA256 required).
func NewKMSSigner(ctx context.Context, client kmsClient, keyName string) (*KMSSigner, error) {
	resp, err := client.GetPublicKey(ctx, &kmspb.GetPublicKeyRequest{Name: keyName})
	if err != nil {
		return nil, fmt.Errorf("kms_signer: get public key %q: %w", keyName, err)
	}

	pubKey, err := parseRSAPublicKeyPEM(resp.Pem)
	if err != nil {
		return nil, fmt.Errorf("kms_signer: parse public key PEM for %q: %w", keyName, err)
	}

	return &KMSSigner{
		client:  client,
		keyName: keyName,
		pubKey:  pubKey,
	}, nil
}

// Sign signs the JWT claims with RS256 via Cloud KMS AsymmetricSign and returns
// the compact JWT string.  The token header encodes alg="RS256" so existing
// Verify() and downstream consumers accept it unchanged.
func (s *KMSSigner) Sign(claims jwt.Claims) (string, error) {
	// Build header + payload (base64url(header).base64url(payload)).
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signingInput, err := tok.SigningString()
	if err != nil {
		return "", fmt.Errorf("kms_signer: build signing string: %w", err)
	}

	// SHA-256 digest of the signing input — matches RSA_SIGN_PKCS1_2048_SHA256.
	digest := sha256.Sum256([]byte(signingInput))

	resp, err := s.client.AsymmetricSign(context.Background(), &kmspb.AsymmetricSignRequest{
		Name: s.keyName,
		Digest: &kmspb.Digest{
			Digest: &kmspb.Digest_Sha256{
				Sha256: digest[:],
			},
		},
	})
	if err != nil {
		return "", fmt.Errorf("kms_signer: AsymmetricSign: %w", err)
	}

	// JWT compact: signingInput + "." + base64url(signature) — no padding.
	sig := base64.RawURLEncoding.EncodeToString(resp.Signature)
	return signingInput + "." + sig, nil
}

// Public returns the cached RSA public key fetched at construction.
func (s *KMSSigner) Public() *rsa.PublicKey {
	return s.pubKey
}

// NewKMSKeyManagementClient creates the real Cloud KMS client.
// Thin wrapper; tested in integration only — unit tests inject a fake kmsClient.
func NewKMSKeyManagementClient(ctx context.Context) (*kms.KeyManagementClient, error) {
	c, err := kms.NewKeyManagementClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("kms_signer: create KMS client: %w", err)
	}
	return c, nil
}

// parseRSAPublicKeyPEM decodes a PEM block and parses a PKIX RSA public key.
// Hard-fails if the key type is not RSA.
func parseRSAPublicKeyPEM(pemStr string) (*rsa.PublicKey, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, fmt.Errorf("no PEM block found in KMS public key response")
	}
	raw, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse PKIX public key: %w", err)
	}
	rsaKey, ok := raw.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("KMS key is not RSA (got %T) — key must use RSA_SIGN_PKCS1_2048_SHA256", raw)
	}
	return rsaKey, nil
}
