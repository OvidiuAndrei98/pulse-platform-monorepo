package invoicing

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
)

type credentialCipher struct {
	aead cipher.AEAD
}

func newCredentialCipher(encodedKey string) (*credentialCipher, error) {
	encodedKey = strings.TrimSpace(encodedKey)
	if encodedKey == "" {
		return nil, errors.New("INVOICING_ENCRYPTION_KEY is not configured")
	}

	key, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil {
		key, err = base64.RawStdEncoding.DecodeString(encodedKey)
	}
	if err != nil || len(key) != 32 {
		return nil, errors.New("INVOICING_ENCRYPTION_KEY must be a base64-encoded 32-byte key")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create invoicing cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create invoicing GCM: %w", err)
	}
	return &credentialCipher{aead: aead}, nil
}

func (c *credentialCipher) encrypt(plaintext []byte, context string) ([]byte, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("generate credential nonce: %w", err)
	}
	return c.aead.Seal(nonce, nonce, plaintext, []byte(context)), nil
}

func (c *credentialCipher) decrypt(ciphertext []byte, context string) ([]byte, error) {
	nonceSize := c.aead.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, errors.New("encrypted credentials are invalid")
	}
	nonce, payload := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := c.aead.Open(nil, nonce, payload, []byte(context))
	if err != nil {
		return nil, errors.New("encrypted credentials could not be decrypted")
	}
	return plaintext, nil
}
