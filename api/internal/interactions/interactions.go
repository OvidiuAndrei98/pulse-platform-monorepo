package interactions

import (
	"encoding/json"
	"net/http"

	db "pulse-api/db/generated"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// 1. CHECK-INS

type Handler struct {
	Queries *db.Queries
}

func NewHandler(queries *db.Queries) *Handler {
	return &Handler{
		Queries: queries,
	}
}

func (h *Handler) HandleCreateCheckIn(w http.ResponseWriter, r *http.Request) {
	var params db.CreateCheckInParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	checkIn, err := h.Queries.CreateCheckIn(r.Context(), params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la înregistrarea check-in-ului: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusCreated, checkIn)
}

func (h *Handler) HandleDeleteCheckIn(w http.ResponseWriter, r *http.Request) {
	var params db.DeleteCheckInParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	err := h.Queries.DeleteCheckIn(r.Context(), params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la ștergerea check-in-ului: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Check-in șters cu succes"})
}

// 2. COMMENTS

func (h *Handler) HandleAddComment(w http.ResponseWriter, r *http.Request) {
	var params db.AddCommentParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	comment, err := h.Queries.AddComment(r.Context(), params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la adăugarea comentariului: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusCreated, comment)
}

// 3. FRIENDSHIPS

func (h *Handler) HandleGetFriends(w http.ResponseWriter, r *http.Request) {
	userIdStr := chi.URLParam(r, "userId")

	// Mapăm string-ul din URL într-un obiect pgtype.UUID
	var userUUID pgtype.UUID
	err := userUUID.Scan(userIdStr)
	if err != nil || !userUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID utilizator invalid (trebuie să fie un UUID valid)")
		return
	}

	// Acum trimitem userUUID (care este pgtype.UUID) în loc de int64
	friends, err := h.Queries.GetFriends(r.Context(), userUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la preluarea listei de prieteni: "+err.Error())
		return
	}

	// Dacă sqlc returnează nil, inițializăm un slice gol
	if friends == nil {
		friends = []db.GetFriendsRow{}
	}

	router.RespondWithJSON(w, http.StatusOK, friends)
}

func (h *Handler) HandleSendFriendRequest(w http.ResponseWriter, r *http.Request) {
	var params db.SendFriendRequestParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	err := h.Queries.SendFriendRequest(r.Context(), params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la trimiterea cererii de prietenie: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusOK, map[string]string{"status": "pending", "message": "Cerere de prietenie trimisă sau deja existentă"})
}

func (h *Handler) HandleRespondToFriendRequest(w http.ResponseWriter, r *http.Request) {
	var params db.RespondToFriendRequestParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	err := h.Queries.RespondToFriendRequest(r.Context(), params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la procesarea răspunsului: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Răspunsul la cererea de prietenie a fost procesat"})
}
