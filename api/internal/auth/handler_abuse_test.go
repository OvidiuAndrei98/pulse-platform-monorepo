package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestDummyPasswordHashUsesProductionBcryptCost(t *testing.T) {
	cost, err := bcrypt.Cost([]byte(dummyPasswordHash))
	if err != nil {
		t.Fatal(err)
	}
	if cost != bcrypt.DefaultCost {
		t.Fatalf("dummy cost = %d, want %d", cost, bcrypt.DefaultCost)
	}
}

func TestLoginRejectsOversizedBodyBeforeDatabaseWork(t *testing.T) {
	handler := &Handler{}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(`{"email":"`+strings.Repeat("a", maxAuthJSONBytes)+`"}`))
	response := httptest.NewRecorder()
	handler.Login(response, request)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", response.Code)
	}
}

func TestRegisterRejectsUnknownJSONFields(t *testing.T) {
	handler := &Handler{}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(`{"username":"buyer","email":"buyer@example.invalid","password":"long-enough-password","role":"admin"}`))
	response := httptest.NewRecorder()
	handler.HandleRegister(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", response.Code)
	}
}
