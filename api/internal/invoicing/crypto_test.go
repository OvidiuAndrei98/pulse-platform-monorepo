package invoicing

import (
	"crypto/rand"
	"encoding/base64"
	"testing"
)

func TestCredentialCipherRoundTripAndContextIsolation(t *testing.T) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}
	cipher, err := newCredentialCipher(base64.StdEncoding.EncodeToString(key))
	if err != nil {
		t.Fatal(err)
	}

	encrypted, err := cipher.encrypt([]byte("provider-api-token"), "organizer-a:oblio")
	if err != nil {
		t.Fatal(err)
	}
	decrypted, err := cipher.decrypt(encrypted, "organizer-a:oblio")
	if err != nil {
		t.Fatal(err)
	}
	if string(decrypted) != "provider-api-token" {
		t.Fatalf("unexpected plaintext %q", decrypted)
	}
	if _, err := cipher.decrypt(encrypted, "organizer-b:oblio"); err == nil {
		t.Fatal("expected decryption with another organizer context to fail")
	}
}

func TestCredentialCipherRequiresA32ByteKey(t *testing.T) {
	if _, err := newCredentialCipher(base64.StdEncoding.EncodeToString([]byte("too-short"))); err == nil {
		t.Fatal("expected short key to be rejected")
	}
}
