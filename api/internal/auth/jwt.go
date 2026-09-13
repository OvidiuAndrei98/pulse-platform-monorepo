package auth

import (
	"errors"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// JWTSigningKey is shared by user and scanner sessions. Never normalize a key:
// signing and verification must use exactly the same bytes.
func JWTSigningKey() ([]byte, error) {
	secret := os.Getenv("JWT_SECRET")
	lower := strings.ToLower(secret)
	if len(secret) < 32 || strings.ContainsAny(secret, " \t\r\n") ||
		strings.Contains(lower, "changeme") || strings.Contains(lower, "change-me") ||
		strings.Contains(lower, "replace-me") || strings.Contains(lower, "your-secret") {
		return nil, errors.New("JWT_SECRET must be a randomly generated secret of at least 32 bytes, without whitespace or placeholders")
	}
	return []byte(secret), nil
}

func parseSession(token string) (*jwt.Token, error) {
	key, err := JWTSigningKey()
	if err != nil {
		return nil, err
	}
	return jwt.Parse(token, func(*jwt.Token) (interface{}, error) {
		return key, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired(), jwt.WithIssuedAt())
}
