package router

import (
	"encoding/json"
	"net/http"
)

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
