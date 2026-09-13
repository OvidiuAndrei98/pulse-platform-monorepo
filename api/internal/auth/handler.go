package auth

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"log"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RegisterRequest definește structura corpului pentru înregistrare
type RegisterRequest struct {
	Username             string `json:"username"`
	Email                string `json:"email"`
	Password             string `json:"password"`
	Bio                  string `json:"bio,omitempty"`
	RequestOrganizerRole bool   `json:"requestOrganizerRole,omitempty"`
	CompanyName          string `json:"companyName,omitempty"`
	Cui                  string `json:"cui,omitempty"`
}

type EmailSender interface {
	SendActivationEmail(ctx context.Context, email, token string) error
	SendPasswordResetEmail(ctx context.Context, email, token string) error
}

// Handler colectează dependențele din app.go
type Handler struct {
	Queries     *db.Queries
	Pool        *pgxpool.Pool
	EmailSender EmailSender
	googleOAuth GoogleOAuthConfig
}

func (h *Handler) claimGuestPurchases(ctx context.Context, userID pgtype.UUID) {
	if err := h.Queries.AssignGuestOrdersToUser(ctx, userID); err != nil {
		log.Printf("guest order claim failed for user %s: %v", userID.String(), err)
		return
	}
	if err := h.Queries.AssignGuestTicketsToUser(ctx, userID); err != nil {
		log.Printf("guest ticket claim failed for user %s: %v", userID.String(), err)
	}
}

// NewHandler este constructorul pentru Handler-ul de auth
func NewHandler(queries *db.Queries, pool *pgxpool.Pool, emailSender EmailSender) *Handler {
	return &Handler{
		Queries:     queries,
		Pool:        pool,
		EmailSender: emailSender,
	}
}

func (h *Handler) HandleRegister(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	if len(req.Username) < 3 || len(req.Username) > 50 {
		router.RespondWithError(w, http.StatusBadRequest, "Username-ul trebuie să aibă între 3 și 50 de caractere")
		return
	}
	if len(req.Password) < 6 {
		router.RespondWithError(w, http.StatusBadRequest, "Parola trebuie să aibă cel puțin 6 caractere")
		return
	}

	var organizerCUI, organizerCompanyName string
	if req.RequestOrganizerRole {
		var err error
		organizerCUI, organizerCompanyName, err = common.NormalizeOrganizerDetails(req.Cui, req.CompanyName)
		if err != nil {
			router.RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	// Apelăm direct funcțiile din auth.go din același pachet
	hashedPassword, err := HashPassword(req.Password)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la procesarea parolei")
		return
	}

	plainToken, hashedToken, err := GenerateSecureToken()
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la generarea token-ului")
		return
	}

	role := "user"
	if req.RequestOrganizerRole {
		role = "organizer"
	}

	ctx := r.Context()
	tx, err := h.Pool.Begin(ctx)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Contul nu a putut fi creat")
		return
	}
	defer tx.Rollback(ctx)
	qtx := h.Queries.WithTx(tx)

	user, err := qtx.CreateUser(ctx, db.CreateUserParams{
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: pgtype.Text{String: hashedPassword, Valid: true},
		Role:         pgtype.Text{String: role, Valid: true},
		IsActive:     pgtype.Bool{Bool: false, Valid: true},
	})
	if err != nil {
		router.RespondWithError(w, http.StatusConflict, "Username-ul sau adresa de email este deja folosita")
		return
	}
	if req.RequestOrganizerRole {
		if err := qtx.CreatePendingOrganizerProfile(ctx, db.CreatePendingOrganizerProfileParams{
			UserID:      user.ID,
			Cui:         organizerCUI,
			CompanyName: organizerCompanyName,
		}); err != nil {
			router.RespondWithError(w, http.StatusConflict, "CUI-ul este deja asociat unui alt cont de organizator")
			return
		}
	}

	_, err = qtx.InsertUserToken(ctx, db.InsertUserTokenParams{
		UserID:    user.ID,
		TokenHash: hashedToken,
		Type:      "activation",
		ExpiresAt: pgtype.Timestamptz{
			Time:  time.Now().Add(24 * time.Hour),
			Valid: true,
		},
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la salvarea token-ului")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Contul nu a putut fi salvat")
		return
	}

	if h.EmailSender != nil {
		go func() {
			if err := h.EmailSender.SendActivationEmail(ctx, user.Email, plainToken); err != nil {
				log.Printf("activation email failed for %s: %v", user.Email, err)
			}
		}()
	}

	router.RespondWithJSON(w, http.StatusCreated, map[string]interface{}{
		"id":        user.ID,
		"username":  user.Username,
		"email":     user.Email,
		"is_active": user.IsActive.Bool,
		"message":   "Cont creat! Verifică email-ul pentru activare.",
	})
}

func (h *Handler) HandleActivate(w http.ResponseWriter, r *http.Request) {
	// 1. Extragem token-ul primit în query string
	plaintextToken := r.URL.Query().Get("token")
	if plaintextToken == "" {
		http.Error(w, "Token-ul lipsește sau este invalid", http.StatusBadRequest)
		return
	}

	// 2. Calculăm hash-ul SHA-256 și îl convertim în string hexazecimal (%x)
	// deoarece în migrare ai VARCHAR(64) pentru token_hash
	tokenHashBytes := sha256.Sum256([]byte(plaintextToken))
	tokenHashStr := fmt.Sprintf("%x", tokenHashBytes)

	// 3. Căutăm token-ul în tabela user_tokens
	dbToken, err := h.Queries.GetUserTokenByHash(r.Context(), db.GetUserTokenByHashParams{
		TokenHash: tokenHashStr,
		Type:      "activation",
	})
	if err != nil {
		http.Error(w, "Token invalid sau expirat", http.StatusUnauthorized)
		return
	}

	// 4. Verificăm dacă token-ul a expirat
	if time.Now().After(dbToken.ExpiresAt.Time) {
		_ = h.Queries.DeleteUserToken(r.Context(), db.DeleteUserTokenParams{
			TokenHash: tokenHashStr,
			Type:      "activation",
		})
		http.Error(w, "Token-ul a expirat. Te rugăm să soliciți un nou link.", http.StatusGone)
		return
	}

	// 5. Activăm utilizatorul (trecem is_active = true)
	err = h.Queries.UpdateUserActivated(r.Context(), dbToken.UserID)
	if err != nil {
		http.Error(w, "Nu s-a putut activa contul", http.StatusInternalServerError)
		return
	}
	h.claimGuestPurchases(r.Context(), dbToken.UserID)

	// 6. Ștergem token-ul folosit pentru a curăța baza de date și a preveni refolosirea
	_ = h.Queries.DeleteUserToken(r.Context(), db.DeleteUserTokenParams{
		TokenHash: tokenHashStr,
		Type:      "activation",
	})

	// 7. Răspundem succes (poți trimite JSON sau chiar să randezi un HTML simplu de succes)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Contul tău Spottr a fost activat cu succes! Te poți loga acum."}`))
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	user, err := h.Queries.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		log.Printf("Login user lookup failed: %v", err)
		router.RespondWithError(w, http.StatusUnauthorized, "Email sau parolă incorectă")
		return
	}

	if !user.IsActive.Bool {
		log.Print("Login rejected: account inactive")
		router.RespondWithError(w, http.StatusForbidden, "Contul nu este activat. Te rugăm să îți verifici email-ul.")
		return
	}
	if !CheckPasswordHash(req.Password, user.PasswordHash.String) {
		log.Print("Login rejected: invalid password")
		router.RespondWithError(w, http.StatusUnauthorized, "Email sau parolă incorectă")
		return
	}
	h.claimGuestPurchases(r.Context(), user.ID)

	tokenString, err := issueUserJWT(user)
	if err != nil {
		log.Printf("Login token creation failed: %v", err)
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la generarea token-ului de autentificare")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, LoginResponse{Token: tokenString})
}

func issueUserJWT(user db.Users) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  user.ID.String(),
		"role": user.Role.String,
		"exp":  time.Now().Add(24 * time.Hour).Unix(),
		"iat":  time.Now().Unix(),
	})

	key, err := JWTSigningKey()
	if err != nil {
		return "", err
	}
	return token.SignedString(key)
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Body invalid")
		return
	}
	// Keep the public response identical, including persistence failures.
	defer router.RespondWithJSON(w, http.StatusOK, map[string]string{
		"message": "Dacă emailul există în sistem, un link de resetare a fost trimis.",
	})

	// 1. Verificăm dacă userul există
	user, err := h.Queries.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		// Securitate: Întoarcem 200 chiar dacă userul nu există, ca să nu dăm indicii atacatorilor
		if !errors.Is(err, pgx.ErrNoRows) {
			log.Print("password reset user lookup failed")
		}
		return
	}

	plainToken, hashedToken, err := GenerateSecureToken()
	if err != nil {
		log.Print("password reset token generation failed")
		return
	}

	tx, err := h.Pool.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		log.Print("password reset token transaction failed")
		return
	}
	defer tx.Rollback(context.Background())
	qtx := h.Queries.WithTx(tx)
	if _, err = qtx.LockUserForPasswordReset(r.Context(), user.ID); err != nil {
		log.Print("password reset token user lock failed")
		return
	}
	_, err = qtx.InsertUserToken(r.Context(), db.InsertUserTokenParams{
		UserID:    user.ID,
		TokenHash: hashedToken,
		Type:      "password_reset",
		ExpiresAt: pgtype.Timestamptz{
			Time:  time.Now().Add(24 * time.Hour),
			Valid: true,
		},
	})
	if err != nil {
		log.Print("password reset token persistence failed")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		log.Print("password reset token commit failed")
		return
	}

	if h.EmailSender != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if err := h.EmailSender.SendPasswordResetEmail(ctx, user.Email, plainToken); err != nil {
				// Do not log provider errors: they may contain the reset URL.
				log.Print("password reset email delivery failed")
			}
		}()
	}
}

type ResetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Body invalid")
		return
	}

	if len(req.NewPassword) < 6 || len(req.NewPassword) > 72 {
		router.RespondWithError(w, http.StatusBadRequest, "Parola trebuie să aibă între 6 și 72 de bytes (caracterele Unicode pot ocupa mai mulți bytes)")
		return
	}

	// 1. Hashem token-ul primit ca să-l putem compara cu ce avem în DB
	hashedToken := HashPlainToken(req.Token)

	// 2. Căutăm token-ul în DB (ar trebui să îți returneze userID și expiry)
	dbToken, err := h.Queries.GetUserTokenByHash(r.Context(), db.GetUserTokenByHashParams{
		TokenHash: hashedToken,
		Type:      "password_reset",
	})
	if err != nil {
		http.Error(w, "Token invalid sau expirat", http.StatusUnauthorized)
		return
	}

	// 4. Hashem noua parolă utilizând bcrypt
	newHash, err := HashPassword(req.NewPassword)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la procesarea parolei")
		return
	}

	// Serialize resets for the entire user, not just one token. A second
	// statement after the lock sees tokens consumed by a concurrent reset.
	tx, err := h.Pool.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Resetarea nu a putut fi salvata")
		return
	}
	defer tx.Rollback(context.Background())
	qtx := h.Queries.WithTx(tx)
	if _, err = qtx.LockUserForPasswordReset(r.Context(), dbToken.UserID); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Resetarea nu a putut fi salvata")
		return
	}
	validated, err := qtx.GetUserTokenByHash(r.Context(), db.GetUserTokenByHashParams{
		TokenHash: hashedToken, Type: "password_reset",
	})
	if err != nil || validated.UserID != dbToken.UserID {
		router.RespondWithError(w, http.StatusUnauthorized, "Token invalid sau expirat")
		return
	}
	err = qtx.UpdateUserPassword(r.Context(), db.UpdateUserPasswordParams{
		ID: dbToken.UserID,
		PasswordHash: pgtype.Text{
			String: newHash,
			Valid:  true,
		},
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut actualiza parola")
		return
	}

	// 6. Ștergem token-ul din DB ca să nu mai poată fi folosit a doua oară
	if err = qtx.DeleteUserPasswordResetTokens(r.Context(), dbToken.UserID); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Resetarea nu a putut fi salvata")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Resetarea nu a putut fi salvata")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Parola a fost resetată cu succes!"})
}
