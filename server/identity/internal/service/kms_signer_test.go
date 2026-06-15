package service_test

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/pem"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/kms/apiv1/kmspb"
	"github.com/golang-jwt/jwt/v5"
	gax "github.com/googleapis/gax-go/v2"

	"github.com/meersajidh/ru-soam/server/identity/internal/model"
	"github.com/meersajidh/ru-soam/server/identity/internal/service"
)

// fakeKMSClient implements the kmsClient interface using a local RSA key.
// Never contacts GCP — digest is signed locally via rsa.SignPKCS1v15.
type fakeKMSClient struct {
	key *rsa.PrivateKey
}

func (f *fakeKMSClient) AsymmetricSign(
	_ context.Context,
	req *kmspb.AsymmetricSignRequest,
	_ ...gax.CallOption,
) (*kmspb.AsymmetricSignResponse, error) {
	digest := req.Digest.GetSha256()
	sig, err := rsa.SignPKCS1v15(rand.Reader, f.key, crypto.SHA256, digest)
	if err != nil {
		return nil, err
	}
	return &kmspb.AsymmetricSignResponse{Signature: sig}, nil
}

func (f *fakeKMSClient) GetPublicKey(
	_ context.Context,
	_ *kmspb.GetPublicKeyRequest,
	_ ...gax.CallOption,
) (*kmspb.PublicKey, error) {
	derBytes, err := x509.MarshalPKIXPublicKey(&f.key.PublicKey)
	if err != nil {
		return nil, err
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: derBytes,
	})
	return &kmspb.PublicKey{Pem: string(pemBytes)}, nil
}

func newFakeKMSClient(t *testing.T) *fakeKMSClient {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate test RSA key: %v", err)
	}
	return &fakeKMSClient{key: key}
}

const fakeKeyName = "projects/test/locations/asia-south1/keyRings/test/cryptoKeys/jwt/cryptoKeyVersions/1"

func makeClaims(sub string) model.Claims {
	eid := "entity-001"
	return model.Claims{
		EntityID: &eid,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   sub,
			Issuer:    "ru-soam-identity",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
}

// TestKMSSignerRoundTrip: token signed with KMSSigner (fake client) passes Verify.
func TestKMSSignerRoundTrip(t *testing.T) {
	ctx := context.Background()
	fake := newFakeKMSClient(t)

	signer, err := service.NewKMSSigner(ctx, fake, fakeKeyName)
	if err != nil {
		t.Fatalf("NewKMSSigner: %v", err)
	}

	claims := makeClaims("test-subject")

	tokenStr, err := signer.Sign(claims)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	// Exactly 3 JWT segments.
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		t.Fatalf("expected 3 JWT segments, got %d: %s", len(parts), tokenStr)
	}

	got, err := service.Verify(tokenStr, signer)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if got.Subject != claims.Subject {
		t.Errorf("Subject: got %q want %q", got.Subject, claims.Subject)
	}
	if got.EntityID == nil || *got.EntityID != *claims.EntityID {
		t.Errorf("EntityID mismatch")
	}
}

// TestKMSSignerTamperedToken: tampered signature fails Verify.
func TestKMSSignerTamperedToken(t *testing.T) {
	ctx := context.Background()
	fake := newFakeKMSClient(t)

	signer, err := service.NewKMSSigner(ctx, fake, fakeKeyName)
	if err != nil {
		t.Fatalf("NewKMSSigner: %v", err)
	}

	tokenStr, err := signer.Sign(makeClaims("tamper-subject"))
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	parts := strings.Split(tokenStr, ".")
	sig := parts[2]
	last := sig[len(sig)-1]
	var newLast byte
	if last == 'A' {
		newLast = 'B'
	} else {
		newLast = 'A'
	}
	tampered := parts[0] + "." + parts[1] + "." + sig[:len(sig)-1] + string(newLast)

	_, err = service.Verify(tampered, signer)
	if err == nil {
		t.Fatal("expected Verify to fail on tampered token but it succeeded")
	}
}

// TestKMSSignerPublicKey: Public() returns key matching GetPublicKey response.
func TestKMSSignerPublicKey(t *testing.T) {
	ctx := context.Background()
	fake := newFakeKMSClient(t)

	signer, err := service.NewKMSSigner(ctx, fake, fakeKeyName)
	if err != nil {
		t.Fatalf("NewKMSSigner: %v", err)
	}

	pub := signer.Public()
	if pub == nil {
		t.Fatal("Public() returned nil")
	}
	if pub.N.Cmp(fake.key.PublicKey.N) != 0 {
		t.Error("cached public key modulus does not match fake key")
	}
}

// TestKMSSignerSigningInputDigest: digest sent to AsymmetricSign equals SHA-256(header.payload).
func TestKMSSignerSigningInputDigest(t *testing.T) {
	ctx := context.Background()

	var capturedDigest []byte
	captureFake := &capturingFakeClient{
		key: newFakeKMSClient(t).key,
		onSign: func(d []byte) {
			capturedDigest = append([]byte(nil), d...)
		},
	}

	signer, err := service.NewKMSSigner(ctx, captureFake, fakeKeyName)
	if err != nil {
		t.Fatalf("NewKMSSigner: %v", err)
	}

	tokenStr, err := signer.Sign(makeClaims("digest-subject"))
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	parts := strings.Split(tokenStr, ".")
	signingInput := parts[0] + "." + parts[1]
	want := sha256.Sum256([]byte(signingInput))

	if len(capturedDigest) != 32 {
		t.Fatalf("captured digest length %d, want 32", len(capturedDigest))
	}
	for i := range want {
		if capturedDigest[i] != want[i] {
			t.Errorf("digest byte %d: got %02x want %02x", i, capturedDigest[i], want[i])
		}
	}
}

// capturingFakeClient wraps a fake key and calls onSign with the SHA-256 digest.
type capturingFakeClient struct {
	key    *rsa.PrivateKey
	onSign func(digest []byte)
}

func (c *capturingFakeClient) AsymmetricSign(
	_ context.Context,
	req *kmspb.AsymmetricSignRequest,
	_ ...gax.CallOption,
) (*kmspb.AsymmetricSignResponse, error) {
	digest := req.Digest.GetSha256()
	if c.onSign != nil {
		c.onSign(digest)
	}
	sig, err := rsa.SignPKCS1v15(rand.Reader, c.key, crypto.SHA256, digest)
	if err != nil {
		return nil, err
	}
	return &kmspb.AsymmetricSignResponse{Signature: sig}, nil
}

func (c *capturingFakeClient) GetPublicKey(
	_ context.Context,
	_ *kmspb.GetPublicKeyRequest,
	_ ...gax.CallOption,
) (*kmspb.PublicKey, error) {
	derBytes, err := x509.MarshalPKIXPublicKey(&c.key.PublicKey)
	if err != nil {
		return nil, err
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: derBytes,
	})
	return &kmspb.PublicKey{Pem: string(pemBytes)}, nil
}
