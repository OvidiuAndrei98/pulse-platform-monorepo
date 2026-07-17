package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"

	"golang.org/x/crypto/bcrypt"
)

// HashPassword generează un hash bcrypt din parola în clar
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// CheckPasswordHash compară o parolă în clar cu hash-ul din DB
func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// GenerateSecureToken generează un token lizibil pentru utilizator (ex: trimis în URL)
// și returnează versiunea în clar și hash-ul SHA-256 (care va fi salvat în DB)
func GenerateSecureToken() (plainToken string, hashedToken string, err error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", "", err
	}

	plainToken = hex.EncodeToString(bytes)

	// Facem hash SHA-256 pentru stocare în baza de date
	hash := sha256.Sum256([]byte(plainToken))
	hashedToken = hex.EncodeToString(hash[:])

	return plainToken, hashedToken, nil
}

// HashPlainToken calculează hash-ul unui token primit din request pentru a-l căuta în DB
func HashPlainToken(plainToken string) string {
	hash := sha256.Sum256([]byte(plainToken))
	return hex.EncodeToString(hash[:])
}
