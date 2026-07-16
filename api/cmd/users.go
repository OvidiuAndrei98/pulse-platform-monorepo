package app

import (
	"encoding/json"
	"net/http"
	db "pulse-api/db/generated"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// Helperi pentru răspunsuri standardizate
func respondWithError(w http.ResponseWriter, code int, message string) {
	respondWithJSON(w, code, map[string]string{"error": message})
}

func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}

// HandleCreateUser salvează un user folosind tipurile generate de sqlc
func (app *Application) HandleCreateUser(w http.ResponseWriter, r *http.Request) {
	var params db.CreateUserParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		respondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	// sqlc a mapat COALESCE($4, 'user') la o interfață Column4 generică.
	// Ne asigurăm că trimitem nil dacă nu e specificat un rol, pentru ca baza de date să aplice default-ul.
	if params.Column4 == nil {
		params.Column4 = nil
	}

	user, err := app.Queries.CreateUser(r.Context(), params)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Nu s-a putut crea utilizatorul: "+err.Error())
		return
	}

	respondWithJSON(w, http.StatusCreated, user)
}

// HandleGetUser parsează UUID-ul din URL și interoghează baza de date
func (app *Application) HandleGetUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")

	// Mapăm string-ul din URL într-un obiect pgtype.UUID valid pentru pgx v5
	var uuid pgtype.UUID
	err := uuid.Scan(idStr)
	if err != nil || !uuid.Valid {
		respondWithError(w, http.StatusBadRequest, "ID-ul (UUID) furnizat este invalid")
		return
	}

	// Apelăm metoda exactă generată de sqlc: GetUserByID
	user, err := app.Queries.GetUserByID(r.Context(), uuid)
	if err != nil {
		// În mod normal, pgx returnează pgx.ErrNoRows dacă nu găsește nimic
		respondWithError(w, http.StatusNotFound, "Utilizatorul nu a fost găsit")
		return
	}

	respondWithJSON(w, http.StatusOK, user)
}
