package interactions

import (
	"encoding/json"
	"net/http"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
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
	userIDStr, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	var userUUID pgtype.UUID
	if err := userUUID.Scan(userIDStr); err != nil || !userUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID utilizator invalid în token")
		return
	}

	eventIDStr := chi.URLParam(r, "id")
	var eventUUID pgtype.UUID
	if err := eventUUID.Scan(eventIDStr); err != nil || !eventUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID eveniment invalid")
		return
	}

	_, err = h.Queries.CreateCheckIn(r.Context(), db.CreateCheckInParams{
		UserID:  userUUID,
		EventID: eventUUID,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la înregistrarea check-in-ului: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) HandleDeleteCheckIn(w http.ResponseWriter, r *http.Request) {
	userIDStr, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	var userUUID pgtype.UUID
	if err := userUUID.Scan(userIDStr); err != nil || !userUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID utilizator invalid în token")
		return
	}

	eventIDStr := chi.URLParam(r, "id")
	var eventUUID pgtype.UUID
	if err := eventUUID.Scan(eventIDStr); err != nil || !eventUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID eveniment invalid")
		return
	}

	if err := h.Queries.DeleteCheckIn(r.Context(), db.DeleteCheckInParams{
		UserID:  userUUID,
		EventID: eventUUID,
	}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la ștergerea check-in-ului: "+err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// 2. COMMENTS

type addCommentRequest struct {
	Content string `json:"content"`
}

func (h *Handler) HandleAddComment(w http.ResponseWriter, r *http.Request) {
	userIDStr, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	var userUUID pgtype.UUID
	if err := userUUID.Scan(userIDStr); err != nil || !userUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID utilizator invalid în token")
		return
	}

	eventIDStr := chi.URLParam(r, "id")
	var eventUUID pgtype.UUID
	if err := eventUUID.Scan(eventIDStr); err != nil || !eventUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID eveniment invalid")
		return
	}

	var req addCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Content-ul comentariului este obligatoriu")
		return
	}

	comment, err := h.Queries.AddComment(r.Context(), db.AddCommentParams{
		EventID: eventUUID,
		UserID:  userUUID,
		Content: req.Content,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la adăugarea comentariului: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusOK, MapComment(comment))
}

type getEventCommentsRequest struct {
	Limit  int32 `json:"limit"`
	Offset int32 `json:"offset"`
}

func (h *Handler) HandleGetEventComments(w http.ResponseWriter, r *http.Request) {
	eventIDStr := chi.URLParam(r, "id")
	var eventUUID pgtype.UUID
	err := eventUUID.Scan(eventIDStr)
	if err != nil || !eventUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID eveniment invalid (trebuie să fie un UUID valid)")
		return
	}

	var req getEventCommentsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	comments, err := h.Queries.GetCommentsForEvent(r.Context(), db.GetCommentsForEventParams{EventID: eventUUID, Limit: req.Limit, Offset: req.Offset})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la preluarea comentariilor: "+err.Error())
		return
	}

	if comments == nil {
		comments = []db.GetCommentsForEventRow{}
	}

	router.RespondWithJSON(w, http.StatusOK, comments)
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

func (h *Handler) HandleGetFriendRequests(w http.ResponseWriter, r *http.Request) {
	userIdStr := chi.URLParam(r, "userId")
	// Mapăm string-ul din URL într-un obiect pgtype.UUID
	var userUUID pgtype.UUID
	err := userUUID.Scan(userIdStr)
	if err != nil || !userUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID utilizator invalid (trebuie să fie un UUID valid)")
		return
	}

	friendRequests, err := h.Queries.GetFriendRequests(r.Context(), userUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la preluarea cererilor de prietenie: "+err.Error())
		return
	}

	// Dacă sqlc returnează nil, inițializăm un slice gol
	if friendRequests == nil {
		friendRequests = []db.GetFriendRequestsRow{}
	}

	router.RespondWithJSON(w, http.StatusOK, friendRequests)
}
