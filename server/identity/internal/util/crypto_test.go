package util_test

import (
	"testing"

	"github.com/meersajidh/ru-soam/server/identity/internal/util"
)

func TestCryptoRandomToken_Length(t *testing.T) {
	t.Parallel()
	// 64-byte input → 86-char base64url (no padding: ceil(64*8/6)=86)
	tok, err := util.CryptoRandomToken(64)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tok) != 86 {
		t.Errorf("expected 86 chars, got %d", len(tok))
	}
}

func TestCryptoRandomToken_Uniqueness(t *testing.T) {
	t.Parallel()
	a, err := util.CryptoRandomToken(64)
	if err != nil {
		t.Fatal(err)
	}
	b, err := util.CryptoRandomToken(64)
	if err != nil {
		t.Fatal(err)
	}
	if a == b {
		t.Error("two tokens were identical — randomness broken")
	}
}

func TestCryptoRandomToken_InvalidSize(t *testing.T) {
	t.Parallel()
	_, err := util.CryptoRandomToken(0)
	if err == nil {
		t.Error("expected error for nBytes=0")
	}
	_, err = util.CryptoRandomToken(-1)
	if err == nil {
		t.Error("expected error for nBytes=-1")
	}
}

func TestS256Hash_Deterministic(t *testing.T) {
	t.Parallel()
	input := "test-token-value"
	h1 := util.S256Hash(input)
	h2 := util.S256Hash(input)
	if h1 != h2 {
		t.Errorf("hash not deterministic: %q != %q", h1, h2)
	}
}

func TestS256Hash_Different(t *testing.T) {
	t.Parallel()
	h1 := util.S256Hash("token-a")
	h2 := util.S256Hash("token-b")
	if h1 == h2 {
		t.Error("different inputs produced the same hash")
	}
}

func TestS256Hash_NonEmpty(t *testing.T) {
	t.Parallel()
	h := util.S256Hash("anything")
	// SHA-256 → 32 bytes → 43 base64url chars (no padding)
	if len(h) != 43 {
		t.Errorf("expected 43-char hash, got %d: %s", len(h), h)
	}
}
