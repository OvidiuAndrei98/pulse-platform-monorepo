package interactions

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type EventRsvpRequest struct {
	Status string `json:"status"`
}

type FriendEventActivityResponse struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatarUrl,omitempty"`
	Status    string `json:"status"`
}

type EventSocialResponse struct {
	InterestedCount   int64                         `json:"interestedCount"`
	GoingCount        int64                         `json:"goingCount"`
	TicketHolderCount int64                         `json:"ticketHolderCount"`
	TicketsSoldCount  int64                         `json:"ticketsSoldCount"`
	ManualGoingCount  int64                         `json:"manualGoingCount"`
	CurrentUserStatus string                        `json:"currentUserStatus"`
	Friends           []FriendEventActivityResponse `json:"friends"`
}

type PublicProfileResponse struct {
	ID                string `json:"id"`
	Username          string `json:"username"`
	AvatarURL         string `json:"avatarUrl,omitempty"`
	Bio               string `json:"bio,omitempty"`
	Role              string `json:"role"`
	OrganizerName     string `json:"organizerName,omitempty"`
	OrganizerVerified bool   `json:"organizerVerified"`
	Relationship      string `json:"relationship"`
	FollowsOrganizer  bool   `json:"followsOrganizer"`
	FollowerCount     int64  `json:"followerCount"`
	EventCount        int64  `json:"eventCount"`
	TicketsSoldCount  int64  `json:"ticketsSoldCount"`
}

type EventAttendeeResponse struct {
	PublicProfileResponse
	AttendanceStatus string `json:"attendanceStatus"`
}

type SocialFeedItemResponse struct {
	ActivityType            string `json:"activityType"`
	OccurredAt              string `json:"occurredAt"`
	ActorID                 string `json:"actorId"`
	ActorUsername           string `json:"actorUsername"`
	ActorAvatarURL          string `json:"actorAvatarUrl,omitempty"`
	EventID                 string `json:"eventId"`
	EventTitle              string `json:"eventTitle"`
	EventBannerURL          string `json:"eventBannerUrl,omitempty"`
	EventStartTime          string `json:"eventStartTime"`
	OrganizerName           string `json:"organizerName,omitempty"`
	OrganizerUpdateID       string `json:"organizerUpdateId,omitempty"`
	OrganizerUpdateImageURL string `json:"organizerUpdateImageUrl,omitempty"`
	OrganizerUpdateCaption  string `json:"organizerUpdateCaption,omitempty"`
}

// 1. CHECK-INS

type Handler struct {
	Queries *db.Queries
}

func NewHandler(queries *db.Queries) *Handler {
	return &Handler{
		Queries: queries,
	}
}

func eventIDFromRequest(r *http.Request) (pgtype.UUID, bool) {
	var eventID pgtype.UUID
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		return pgtype.UUID{}, false
	}
	return eventID, true
}

func userIDFromRequest(r *http.Request) (pgtype.UUID, bool) {
	userIDString, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		return pgtype.UUID{}, false
	}
	var userID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		return pgtype.UUID{}, false
	}
	return userID, true
}

func (h *Handler) eventSocialResponse(r *http.Request, eventID, userID pgtype.UUID) (EventSocialResponse, error) {
	summary, err := h.Queries.GetEventSocialSummary(r.Context(), db.GetEventSocialSummaryParams{
		EventID: eventID,
		UserID:  userID,
	})
	if err != nil {
		return EventSocialResponse{}, err
	}

	response := EventSocialResponse{
		InterestedCount:   summary.InterestedCount,
		GoingCount:        summary.GoingCount,
		TicketHolderCount: summary.TicketHolderCount,
		TicketsSoldCount:  summary.TicketsSoldCount,
		ManualGoingCount:  summary.ManualGoingCount,
		CurrentUserStatus: summary.CurrentUserStatus,
		Friends:           []FriendEventActivityResponse{},
	}
	if !userID.Valid {
		return response, nil
	}

	friends, err := h.Queries.ListFriendEventActivity(r.Context(), db.ListFriendEventActivityParams{
		UserID:  userID,
		EventID: eventID,
	})
	if err != nil {
		return EventSocialResponse{}, err
	}
	for _, friend := range friends {
		status, _ := friend.Status.(string)
		response.Friends = append(response.Friends, FriendEventActivityResponse{
			ID:        friend.ID.String(),
			Username:  friend.Username,
			AvatarURL: friend.AvatarUrl.String,
			Status:    status,
		})
	}
	return response, nil
}

func (h *Handler) HandleGetEventSocial(w http.ResponseWriter, r *http.Request) {
	eventID, ok := eventIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, http.StatusBadRequest, "ID eveniment invalid")
		return
	}
	userID, _ := userIDFromRequest(r)
	response, err := h.eventSocialResponse(r, eventID, userID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Datele sociale nu au putut fi incarcate")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, response)
}

func (h *Handler) HandleUpdateEventRsvp(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	eventID, ok := eventIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, http.StatusBadRequest, "ID eveniment invalid")
		return
	}

	var request EventRsvpRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil || (request.Status != "interested" && request.Status != "going") {
		router.RespondWithError(w, http.StatusBadRequest, "Statusul trebuie sa fie interested sau going")
		return
	}

	summary, err := h.Queries.GetEventSocialSummary(r.Context(), db.GetEventSocialSummaryParams{EventID: eventID, UserID: userID})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Statusul nu a putut fi verificat")
		return
	}
	if summary.CurrentUserStatus == "has_ticket" {
		router.RespondWithError(w, http.StatusConflict, "Ai deja bilet pentru acest eveniment")
		return
	}
	if err := h.Queries.UpsertEventRsvp(r.Context(), db.UpsertEventRsvpParams{UserID: userID, EventID: eventID, Status: request.Status}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Statusul nu a putut fi salvat")
		return
	}

	response, err := h.eventSocialResponse(r, eventID, userID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Statusul nu a putut fi actualizat")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, response)
}

func (h *Handler) HandleDeleteEventRsvp(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	eventID, ok := eventIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, http.StatusBadRequest, "ID eveniment invalid")
		return
	}
	if err := h.Queries.DeleteEventRsvp(r.Context(), db.DeleteEventRsvpParams{UserID: userID, EventID: eventID}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Statusul nu a putut fi eliminat")
		return
	}
	response, err := h.eventSocialResponse(r, eventID, userID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Statusul nu a putut fi actualizat")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, response)
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

// 3. SOCIAL GRAPH

func profileIDFromRequest(r *http.Request, name string) (pgtype.UUID, bool) {
	var profileID pgtype.UUID
	if err := profileID.Scan(chi.URLParam(r, name)); err != nil || !profileID.Valid {
		return pgtype.UUID{}, false
	}
	return profileID, true
}

func (h *Handler) profileState(ctx context.Context, viewerID, profileID pgtype.UUID, role string) (string, bool, int64, error) {
	relationship := "none"
	followsOrganizer := false
	if viewerID.Valid {
		if viewerID == profileID {
			relationship = "self"
		} else {
			value, err := h.Queries.GetFriendshipRelationship(ctx, db.GetFriendshipRelationshipParams{UserID: viewerID, FriendID: profileID})
			if err != nil {
				return "", false, 0, err
			}
			relationship = value
		}
		if role == "organizer" && viewerID != profileID {
			value, err := h.Queries.GetOrganizerFollowState(ctx, db.GetOrganizerFollowStateParams{FollowerID: viewerID, OrganizerID: profileID})
			if err != nil {
				return "", false, 0, err
			}
			followsOrganizer = value
		}
	}

	followerCount := int64(0)
	if role == "organizer" {
		value, err := h.Queries.GetOrganizerFollowerCount(ctx, profileID)
		if err != nil {
			return "", false, 0, err
		}
		followerCount = value
	}
	return relationship, followsOrganizer, followerCount, nil
}

// Public profiles describe the organizer identity of administrators who also
// operate events. Their authenticated account role remains admin in /users/me.
func publicProfileRole(role, organizerName string, organizerVerified bool) string {
	if role == "admin" && (strings.TrimSpace(organizerName) != "" || organizerVerified) {
		return "organizer"
	}
	return role
}

func (h *Handler) publicProfileResponse(ctx context.Context, viewerID, profileID pgtype.UUID, username string, avatarURL, bio pgtype.Text, role, organizerName string, organizerVerified bool) (PublicProfileResponse, error) {
	role = publicProfileRole(role, organizerName, organizerVerified)
	relationship, followsOrganizer, followerCount, err := h.profileState(ctx, viewerID, profileID, role)
	if err != nil {
		return PublicProfileResponse{}, err
	}
	return PublicProfileResponse{
		ID: profileID.String(), Username: username, AvatarURL: avatarURL.String, Bio: bio.String,
		Role: role, OrganizerName: organizerName, OrganizerVerified: organizerVerified,
		Relationship: relationship, FollowsOrganizer: followsOrganizer, FollowerCount: followerCount,
	}, nil
}

func (h *Handler) HandleSearchProfiles(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimPrefix(strings.TrimSpace(r.URL.Query().Get("q")), "@")
	kind := r.URL.Query().Get("kind")
	if (kind != "" && kind != "people" && kind != "organizers") || utf8.RuneCountInString(query) > 120 {
		router.RespondWithError(w, http.StatusBadRequest, "Invalid search filter")
		return
	}
	if query == "" {
		router.RespondWithJSON(w, http.StatusOK, []PublicProfileResponse{})
		return
	}
	viewerID, _ := userIDFromRequest(r)
	profiles, err := h.Queries.SearchProfiles(r.Context(), db.SearchProfilesParams{Column1: pgtype.Text{String: query, Valid: true}, Kind: kind})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Profilurile nu au putut fi cautate")
		return
	}
	response := make([]PublicProfileResponse, 0, len(profiles))
	for _, profile := range profiles {
		item, err := h.publicProfileResponse(r.Context(), viewerID, profile.ID, profile.Username, profile.AvatarUrl, profile.Bio, profile.Role.String, profile.OrganizerName, profile.OrganizerVerified)
		if err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Starea profilului nu a putut fi incarcata")
			return
		}
		response = append(response, item)
	}
	router.RespondWithJSON(w, http.StatusOK, response)
}

func (h *Handler) HandleGetPublicProfile(w http.ResponseWriter, r *http.Request) {
	profileID, ok := profileIDFromRequest(r, "id")
	if !ok {
		router.RespondWithError(w, http.StatusBadRequest, "ID profil invalid")
		return
	}
	viewerID, _ := userIDFromRequest(r)
	profile, err := h.Queries.GetPublicProfile(r.Context(), profileID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Profilul nu a fost gasit")
		return
	}
	response, err := h.publicProfileResponse(r.Context(), viewerID, profile.ID, profile.Username, profile.AvatarUrl, profile.Bio, profile.Role.String, profile.OrganizerName, profile.OrganizerVerified)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Profilul nu a putut fi incarcat")
		return
	}
	if response.Role == "organizer" {
		stats, err := h.Queries.GetOrganizerPublicStats(r.Context(), profile.ID)
		if err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Statisticile organizatorului nu au putut fi incarcate")
			return
		}
		response.EventCount = stats.EventCount
		response.TicketsSoldCount = stats.TicketsSoldCount
	}
	router.RespondWithJSON(w, http.StatusOK, response)
}

func (h *Handler) legacyHandleGetFriends(w http.ResponseWriter, r *http.Request) {
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

func (h *Handler) legacyHandleSendFriendRequest(w http.ResponseWriter, r *http.Request) {
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

func (h *Handler) legacyHandleRespondToFriendRequest(w http.ResponseWriter, r *http.Request) {
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

func (h *Handler) legacyHandleGetFriendRequests(w http.ResponseWriter, r *http.Request) {
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

func (h *Handler) HandleGetFriends(w http.ResponseWriter, r *http.Request) {
	viewerID, ok := userIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	friends, err := h.Queries.GetFriends(r.Context(), viewerID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Prietenii nu au putut fi incarcati")
		return
	}
	response := make([]PublicProfileResponse, 0, len(friends))
	for _, friend := range friends {
		item, err := h.publicProfileResponse(r.Context(), viewerID, friend.ID, friend.Username, friend.AvatarUrl, friend.Bio, friend.Role.String, "", false)
		if err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Prietenii nu au putut fi incarcati")
			return
		}
		response = append(response, item)
	}
	router.RespondWithJSON(w, http.StatusOK, response)
}

func (h *Handler) HandleSendFriendRequest(w http.ResponseWriter, r *http.Request) {
	viewerID, ok := userIDFromRequest(r)
	targetID, targetOK := profileIDFromRequest(r, "userId")
	if !ok || !targetOK || viewerID == targetID {
		router.RespondWithError(w, http.StatusBadRequest, "Utilizator invalid")
		return
	}
	if _, err := h.Queries.GetPublicProfile(r.Context(), targetID); err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Profilul nu a fost gasit")
		return
	}
	relationship, err := h.Queries.GetFriendshipRelationship(r.Context(), db.GetFriendshipRelationshipParams{UserID: viewerID, FriendID: targetID})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Cererea nu a putut fi verificata")
		return
	}
	if relationship == "pending_received" {
		updated, err := h.Queries.AcceptFriendRequest(r.Context(), db.AcceptFriendRequestParams{UserID: viewerID, FriendID: targetID})
		if err != nil || updated == 0 {
			router.RespondWithError(w, http.StatusInternalServerError, "Cererea nu a putut fi acceptata")
			return
		}
		_ = h.Queries.CreateNotification(r.Context(), db.CreateNotificationParams{
			UserID:  targetID,
			Type:    "friend_accepted",
			Title:   "Cerere de prietenie acceptata",
			Body:    "Cererea ta de prietenie a fost acceptata.",
			ActorID: viewerID,
		})
		router.RespondWithJSON(w, http.StatusOK, map[string]string{"relationship": "friends"})
		return
	}
	if relationship == "friends" || relationship == "pending_sent" {
		router.RespondWithJSON(w, http.StatusOK, map[string]string{"relationship": relationship})
		return
	}
	created, err := h.Queries.CreateFriendRequest(r.Context(), db.CreateFriendRequestParams{UserID: viewerID, FriendID: targetID})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Cererea nu a putut fi trimisa")
		return
	}
	if created > 0 {
		_ = h.Queries.CreateNotification(r.Context(), db.CreateNotificationParams{
			UserID:  targetID,
			Type:    "friend_request",
			Title:   "Cerere noua de prietenie",
			Body:    "Ai primit o cerere noua de prietenie.",
			ActorID: viewerID,
		})
	}
	router.RespondWithJSON(w, http.StatusCreated, map[string]string{"relationship": "pending_sent"})
}

type friendRequestAction struct {
	Status string `json:"status"`
}

func (h *Handler) HandleRespondToFriendRequest(w http.ResponseWriter, r *http.Request) {
	viewerID, ok := userIDFromRequest(r)
	requesterID, requesterOK := profileIDFromRequest(r, "userId")
	if !ok || !requesterOK {
		router.RespondWithError(w, http.StatusBadRequest, "Utilizator invalid")
		return
	}
	var action friendRequestAction
	if err := json.NewDecoder(r.Body).Decode(&action); err != nil || (action.Status != "accepted" && action.Status != "declined") {
		router.RespondWithError(w, http.StatusBadRequest, "Raspuns invalid")
		return
	}
	var err error
	if action.Status == "accepted" {
		var updated int64
		updated, err = h.Queries.AcceptFriendRequest(r.Context(), db.AcceptFriendRequestParams{UserID: viewerID, FriendID: requesterID})
		if err == nil && updated == 0 {
			router.RespondWithError(w, http.StatusNotFound, "Cererea nu mai este disponibila")
			return
		}
	} else {
		err = h.Queries.DeclineFriendRequest(r.Context(), db.DeclineFriendRequestParams{UserID: viewerID, FriendID: requesterID})
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Cererea nu a putut fi actualizata")
		return
	}
	relationship := "none"
	if action.Status == "accepted" {
		relationship = "friends"
		_ = h.Queries.CreateNotification(r.Context(), db.CreateNotificationParams{
			UserID:  requesterID,
			Type:    "friend_accepted",
			Title:   "Cerere de prietenie acceptata",
			Body:    "Cererea ta de prietenie a fost acceptata.",
			ActorID: viewerID,
		})
	}
	router.RespondWithJSON(w, http.StatusOK, map[string]string{"relationship": relationship})
}

func (h *Handler) HandleConnectWithFriend(w http.ResponseWriter, r *http.Request) {
	viewerID, ok := userIDFromRequest(r)
	targetID, targetOK := profileIDFromRequest(r, "userId")
	if !ok || !targetOK || viewerID == targetID {
		router.RespondWithError(w, http.StatusBadRequest, "Cod QR invalid")
		return
	}
	if err := h.Queries.ConnectFriends(r.Context(), db.ConnectFriendsParams{UserID: viewerID, FriendID: targetID}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Conectarea nu a putut fi realizata")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, map[string]string{"relationship": "friends"})
}

func (h *Handler) HandleRemoveFriend(w http.ResponseWriter, r *http.Request) {
	viewerID, ok := userIDFromRequest(r)
	targetID, targetOK := profileIDFromRequest(r, "userId")
	if !ok || !targetOK || viewerID == targetID {
		router.RespondWithError(w, http.StatusBadRequest, "Utilizator invalid")
		return
	}

	removed, err := h.Queries.RemoveFriend(r.Context(), db.RemoveFriendParams{
		UserID:   viewerID,
		FriendID: targetID,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Prietenul nu a putut fi eliminat")
		return
	}
	if removed == 0 {
		router.RespondWithError(w, http.StatusNotFound, "Relatia de prietenie nu mai exista")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, map[string]string{"relationship": "none"})
}

func (h *Handler) HandleGetFriendRequests(w http.ResponseWriter, r *http.Request) {
	viewerID, ok := userIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	requests, err := h.Queries.GetFriendRequests(r.Context(), viewerID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Cererile nu au putut fi incarcate")
		return
	}
	response := make([]PublicProfileResponse, 0, len(requests))
	for _, request := range requests {
		response = append(response, PublicProfileResponse{ID: request.ID.String(), Username: request.Username, AvatarURL: request.AvatarUrl.String, Bio: request.Bio.String, Role: request.Role.String, Relationship: "pending_received"})
	}
	router.RespondWithJSON(w, http.StatusOK, response)
}

func (h *Handler) HandleFollowOrganizer(w http.ResponseWriter, r *http.Request) {
	viewerID, ok := userIDFromRequest(r)
	targetID, targetOK := profileIDFromRequest(r, "userId")
	if !ok || !targetOK || viewerID == targetID {
		router.RespondWithError(w, http.StatusBadRequest, "Organizator invalid")
		return
	}
	profile, err := h.Queries.GetPublicProfile(r.Context(), targetID)
	if err != nil || publicProfileRole(profile.Role.String, profile.OrganizerName, profile.OrganizerVerified) != "organizer" {
		router.RespondWithError(w, http.StatusNotFound, "Organizatorul nu a fost gasit")
		return
	}
	if err := h.Queries.FollowOrganizer(r.Context(), db.FollowOrganizerParams{FollowerID: viewerID, OrganizerID: targetID}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Organizatorul nu a putut fi urmarit")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, map[string]bool{"followsOrganizer": true})
}

func (h *Handler) HandleUnfollowOrganizer(w http.ResponseWriter, r *http.Request) {
	viewerID, ok := userIDFromRequest(r)
	targetID, targetOK := profileIDFromRequest(r, "userId")
	if !ok || !targetOK {
		router.RespondWithError(w, http.StatusBadRequest, "Organizator invalid")
		return
	}
	if err := h.Queries.UnfollowOrganizer(r.Context(), db.UnfollowOrganizerParams{FollowerID: viewerID, OrganizerID: targetID}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Organizatorul nu a putut fi actualizat")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, map[string]bool{"followsOrganizer": false})
}

func (h *Handler) HandleGetEventAttendees(w http.ResponseWriter, r *http.Request) {
	eventID, ok := eventIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, http.StatusBadRequest, "ID eveniment invalid")
		return
	}
	viewerID, _ := userIDFromRequest(r)
	attendees, err := h.Queries.ListEventAttendees(r.Context(), eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Participantii nu au putut fi incarcati")
		return
	}
	response := make([]EventAttendeeResponse, 0, len(attendees))
	for _, attendee := range attendees {
		profile, err := h.publicProfileResponse(r.Context(), viewerID, attendee.ID, attendee.Username, attendee.AvatarUrl, pgtype.Text{}, "user", "", false)
		if err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Participantii nu au putut fi incarcati")
			return
		}
		response = append(response, EventAttendeeResponse{PublicProfileResponse: profile, AttendanceStatus: attendee.AttendanceStatus})
	}
	router.RespondWithJSON(w, http.StatusOK, response)
}

func (h *Handler) HandleGetSocialFeed(w http.ResponseWriter, r *http.Request) {
	viewerID, ok := userIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	items, err := h.Queries.ListSocialFeed(r.Context(), viewerID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Feed-ul nu a putut fi incarcat")
		return
	}
	response := make([]SocialFeedItemResponse, 0, len(items))
	for _, item := range items {
		response = append(response, SocialFeedItemResponse{
			ActivityType: item.ActivityType, OccurredAt: socialOccurredAt(item.OccurredAt),
			ActorID: item.ActorID.String(), ActorUsername: item.ActorUsername, ActorAvatarURL: item.ActorAvatarUrl.String,
			EventID: item.EventID.String(), EventTitle: item.EventTitle, EventBannerURL: item.EventBannerUrl.String,
			EventStartTime: common.TimestampToString(item.EventStartTime), OrganizerName: item.OrganizerName,
			OrganizerUpdateID: item.OrganizerUpdateID.String(), OrganizerUpdateImageURL: item.OrganizerUpdateImageUrl,
			OrganizerUpdateCaption: item.OrganizerUpdateCaption,
		})
	}
	router.RespondWithJSON(w, http.StatusOK, response)
}

func socialOccurredAt(value interface{}) string {
	switch timestamp := value.(type) {
	case time.Time:
		return timestamp.UTC().Format(time.RFC3339)
	case pgtype.Timestamptz:
		return common.TimestampToString(timestamp)
	default:
		return ""
	}
}
