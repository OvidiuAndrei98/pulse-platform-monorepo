package router

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

// DecodeJSON limits request memory/CPU exposure, rejects unknown fields, and
// requires exactly one JSON value. It writes the public error response itself.
func DecodeJSON(w http.ResponseWriter, r *http.Request, destination any, maxBytes int64) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			RespondWithError(w, http.StatusRequestEntityTooLarge, "Request body prea mare")
			return false
		}
		RespondWithError(w, http.StatusBadRequest, "Request body invalid")
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			RespondWithError(w, http.StatusRequestEntityTooLarge, "Request body prea mare")
			return false
		}
		RespondWithError(w, http.StatusBadRequest, "Request body trebuie sa contina un singur obiect JSON")
		return false
	}
	return true
}

// RespondWithError trimite un răspuns JSON standardizat în caz de eroare
func RespondWithError(w http.ResponseWriter, code int, message string) {
	RespondWithJSON(w, code, map[string]string{"error": message})
}

// RespondWithJSON scrie header-ele corecte și serializează obiectul primit în format JSON
func RespondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	response, err := json.Marshal(payload)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error": "Eroare internă la serializarea răspunsului"}`))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}
