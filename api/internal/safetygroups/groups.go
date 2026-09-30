package safetygroups

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"pulse-api/internal/abuse"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	maxInvitedFriends       = 7
	maxMessageBytes   int64 = 2048
)

type Handler struct {
	DB    *pgxpool.Pool
	Abuse *abuse.Protection
}

func NewHandler(db *pgxpool.Pool, protection *abuse.Protection) *Handler {
	return &Handler{DB: db, Abuse: protection}
}

type memberResponse struct {
	UserID    string `json:"userId"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatarUrl,omitempty"`
	Status    string `json:"status"`
}

type messageResponse struct {
	ID              string `json:"id"`
	SenderID        string `json:"senderId"`
	SenderUsername  string `json:"senderUsername"`
	SenderAvatarURL string `json:"senderAvatarUrl,omitempty"`
	Kind            string `json:"kind"`
	Content         string `json:"content"`
	CreatedAt       string `json:"createdAt"`
}

type friendResponse struct {
	UserID    string `json:"userId"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatarUrl,omitempty"`
}

type groupResponse struct {
	ID                   string            `json:"id"`
	EventID              string            `json:"eventId"`
	EventTitle           string            `json:"eventTitle"`
	EventLocation        string            `json:"eventLocation"`
	StartTime            string            `json:"startTime"`
	EndTime              string            `json:"endTime"`
	ExpiresAt            string            `json:"expiresAt"`
	OwnerID              string            `json:"ownerId"`
	CurrentMemberStatus  string            `json:"currentMemberStatus"`
	CanSendHelp          bool              `json:"canSendHelp"`
	CurrentUserNeedsHelp bool              `json:"currentUserNeedsHelp"`
	Members              []memberResponse  `json:"members"`
	Messages             []messageResponse `json:"messages"`
}

type envelopeResponse struct {
	CanCreate       bool             `json:"canCreate"`
	TicketValidated bool             `json:"ticketValidated"`
	Group           *groupResponse   `json:"group,omitempty"`
	EligibleFriends []friendResponse `json:"eligibleFriends"`
}

type createRequest struct {
	FriendIDs []string `json:"friendIds"`
}

type respondRequest struct {
	Status string `json:"status"`
}

type messageRequest struct {
	Content string `json:"content"`
}

func requestUUIDs(r *http.Request) (pgtype.UUID, pgtype.UUID, bool) {
	userIDValue, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	var userID, eventID pgtype.UUID
	if err := userID.Scan(userIDValue); err != nil || !userID.Valid {
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	return userID, eventID, true
}

func (h *Handler) allowUserAction(w http.ResponseWriter, r *http.Request, scope string, userID, eventID pgtype.UUID, limit int, window time.Duration) bool {
	if h.Abuse == nil {
		return true
	}
	subject := common.UUIDToString(userID) + ":" + common.UUIDToString(eventID)
	return h.Abuse.Enforce(r.Context(), w, scope, subject, limit, window)
}

func parseUniqueUUIDs(values []string) ([]pgtype.UUID, bool) {
	if len(values) > maxInvitedFriends {
		return nil, false
	}
	seen := make(map[[16]byte]struct{}, len(values))
	result := make([]pgtype.UUID, 0, len(values))
	for _, value := range values {
		var id pgtype.UUID
		if err := id.Scan(value); err != nil || !id.Valid {
			return nil, false
		}
		if _, exists := seen[id.Bytes]; exists {
			continue
		}
		seen[id.Bytes] = struct{}{}
		result = append(result, id)
	}
	return result, true
}

func (h *Handler) hasPaidTicket(ctx context.Context, executor interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, userID, eventID pgtype.UUID) (bool, error) {
	var exists bool
	err := executor.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM tickets ticket
			JOIN orders order_row ON order_row.id = ticket.order_id
			WHERE order_row.event_id = $2
			  AND order_row.status = 'completed'
			  AND (ticket.user_id = $1 OR (ticket.user_id IS NULL AND order_row.user_id = $1))
		)`, userID, eventID).Scan(&exists)
	return exists, err
}

func (h *Handler) hasValidatedTicket(ctx context.Context, userID, eventID pgtype.UUID) (bool, error) {
	var exists bool
	err := h.DB.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM tickets ticket
			JOIN orders order_row ON order_row.id = ticket.order_id
			WHERE order_row.event_id = $2
			  AND order_row.status = 'completed'
			  AND ticket.user_id = $1
			  AND ticket.is_validated = TRUE
		)`, userID, eventID).Scan(&exists)
	return exists, err
}

func (h *Handler) eligibleFriends(ctx context.Context, userID, eventID pgtype.UUID) ([]friendResponse, error) {
	rows, err := h.DB.Query(ctx, `
		WITH accepted_friends AS (
			SELECT CASE WHEN friendship.user_id = $1 THEN friendship.friend_id ELSE friendship.user_id END AS friend_id
			FROM friendships friendship
			WHERE friendship.status = 'accepted'
			  AND (friendship.user_id = $1 OR friendship.friend_id = $1)
		)
		SELECT friend.id, friend.username, COALESCE(friend.avatar_url, '')
		FROM accepted_friends accepted
		JOIN users friend ON friend.id = accepted.friend_id
		WHERE EXISTS (
			SELECT 1
			FROM tickets ticket
			JOIN orders order_row ON order_row.id = ticket.order_id
			WHERE order_row.event_id = $2
			  AND order_row.status = 'completed'
			  AND (ticket.user_id = friend.id OR (ticket.user_id IS NULL AND order_row.user_id = friend.id))
		)
		AND NOT EXISTS (
			SELECT 1 FROM event_safety_group_members member
			WHERE member.event_id = $2 AND member.user_id = friend.id
		)
		ORDER BY lower(friend.username)
		LIMIT 100`, userID, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]friendResponse, 0)
	for rows.Next() {
		var id pgtype.UUID
		var item friendResponse
		if err := rows.Scan(&id, &item.Username, &item.AvatarURL); err != nil {
			return nil, err
		}
		item.UserID = common.UUIDToString(id)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (h *Handler) HandleGet(w http.ResponseWriter, r *http.Request) {
	userID, eventID, ok := requestUUIDs(r)
	if !ok {
		router.RespondWithError(w, http.StatusBadRequest, "Cerere invalida")
		return
	}
	if !h.allowUserAction(w, r, "safety_group_read_user", userID, eventID, 120, time.Minute) {
		return
	}

	paid, err := h.hasPaidTicket(r.Context(), h.DB, userID, eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Grupul nu a putut fi incarcat")
		return
	}
	validated, err := h.hasValidatedTicket(r.Context(), userID, eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Grupul nu a putut fi incarcat")
		return
	}
	if !paid {
		router.RespondWithJSON(w, http.StatusOK, envelopeResponse{
			CanCreate: false, TicketValidated: false, EligibleFriends: make([]friendResponse, 0),
		})
		return
	}

	var (
		groupID, ownerID              pgtype.UUID
		title, location, memberStatus string
		startTime, endTime, expiresAt time.Time
	)
	err = h.DB.QueryRow(r.Context(), `
		SELECT group_row.id, group_row.owner_id, event.title, event.location_name,
		       event.start_time, event.end_time, group_row.expires_at, member.status
		FROM event_safety_group_members member
		JOIN event_safety_groups group_row ON group_row.id = member.group_id
		JOIN events event ON event.id = group_row.event_id
		WHERE member.user_id = $1 AND member.event_id = $2
		  AND group_row.expires_at > CURRENT_TIMESTAMP
		LIMIT 1`, userID, eventID).Scan(
		&groupID, &ownerID, &title, &location, &startTime, &endTime, &expiresAt, &memberStatus,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		var eventExpires time.Time
		if eventErr := h.DB.QueryRow(r.Context(), `SELECT end_time + interval '24 hours' FROM events WHERE id = $1`, eventID).Scan(&eventExpires); eventErr != nil {
			if errors.Is(eventErr, pgx.ErrNoRows) {
				router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu exista")
			} else {
				router.RespondWithError(w, http.StatusInternalServerError, "Grupul nu a putut fi incarcat")
			}
			return
		}
		friends, friendErr := h.eligibleFriends(r.Context(), userID, eventID)
		if friendErr != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Prietenii nu au putut fi incarcati")
			return
		}
		router.RespondWithJSON(w, http.StatusOK, envelopeResponse{
			CanCreate: paid && eventExpires.After(time.Now()), TicketValidated: validated, EligibleFriends: friends,
		})
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Grupul nu a putut fi incarcat")
		return
	}

	group := &groupResponse{
		ID: common.UUIDToString(groupID), EventID: common.UUIDToString(eventID), EventTitle: title,
		EventLocation: location, StartTime: startTime.UTC().Format(time.RFC3339), EndTime: endTime.UTC().Format(time.RFC3339),
		ExpiresAt: expiresAt.UTC().Format(time.RFC3339), OwnerID: common.UUIDToString(ownerID),
		CurrentMemberStatus: memberStatus, CanSendHelp: false,
		Members: make([]memberResponse, 0), Messages: make([]messageResponse, 0),
	}

	memberRows, err := h.DB.Query(r.Context(), `
		SELECT member.user_id, user_row.username, COALESCE(user_row.avatar_url, ''), member.status
		FROM event_safety_group_members member
		JOIN users user_row ON user_row.id = member.user_id
		WHERE member.group_id = $1
		ORDER BY member.created_at`, groupID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Grupul nu a putut fi incarcat")
		return
	}
	for memberRows.Next() {
		var id pgtype.UUID
		var item memberResponse
		if err := memberRows.Scan(&id, &item.Username, &item.AvatarURL, &item.Status); err != nil {
			memberRows.Close()
			router.RespondWithError(w, http.StatusInternalServerError, "Grupul nu a putut fi incarcat")
			return
		}
		item.UserID = common.UUIDToString(id)
		group.Members = append(group.Members, item)
	}
	memberRows.Close()
	var hasEligibleRecipient bool
	if err := h.DB.QueryRow(r.Context(), `
		SELECT EXISTS (
			SELECT 1
			FROM event_safety_group_members member
			WHERE member.group_id = $1 AND member.status = 'accepted' AND member.user_id <> $2
			  AND EXISTS (
				SELECT 1 FROM tickets ticket
				JOIN orders order_row ON order_row.id = ticket.order_id
				WHERE order_row.event_id = $3 AND order_row.status = 'completed'
				  AND (ticket.user_id = member.user_id
				    OR (ticket.user_id IS NULL AND order_row.user_id = member.user_id))
			  )
		)`, groupID, userID, eventID).Scan(&hasEligibleRecipient); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eligibilitatea grupului nu a putut fi verificata")
		return
	}
	group.CanSendHelp = validated && memberStatus == "accepted" && hasEligibleRecipient

	if memberStatus == "accepted" {
		var latestHelpKind string
		helpErr := h.DB.QueryRow(r.Context(), `
			SELECT kind
			FROM event_safety_messages
			WHERE group_id = $1 AND sender_id = $2
			  AND kind IN ('help', 'help_resolved')
			  AND expires_at > CURRENT_TIMESTAMP
			ORDER BY created_at DESC
			LIMIT 1`, groupID, userID).Scan(&latestHelpKind)
		if helpErr != nil && !errors.Is(helpErr, pgx.ErrNoRows) {
			router.RespondWithError(w, http.StatusInternalServerError, "Starea alertei nu a putut fi incarcata")
			return
		}
		group.CurrentUserNeedsHelp = latestHelpKind == "help"

		messageRows, queryErr := h.DB.Query(r.Context(), `
			SELECT message.id, message.sender_id, sender.username, COALESCE(sender.avatar_url, ''),
			       message.kind, message.content, message.created_at
			FROM event_safety_messages message
			JOIN users sender ON sender.id = message.sender_id
			WHERE message.group_id = $1 AND message.expires_at > CURRENT_TIMESTAMP
			ORDER BY message.created_at DESC
			LIMIT 200`, groupID)
		if queryErr != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Mesajele nu au putut fi incarcate")
			return
		}
		for messageRows.Next() {
			var id, senderID pgtype.UUID
			var createdAt time.Time
			var item messageResponse
			if err := messageRows.Scan(&id, &senderID, &item.SenderUsername, &item.SenderAvatarURL, &item.Kind, &item.Content, &createdAt); err != nil {
				messageRows.Close()
				router.RespondWithError(w, http.StatusInternalServerError, "Mesajele nu au putut fi incarcate")
				return
			}
			item.ID, item.SenderID = common.UUIDToString(id), common.UUIDToString(senderID)
			item.CreatedAt = createdAt.UTC().Format(time.RFC3339)
			group.Messages = append([]messageResponse{item}, group.Messages...)
		}
		messageRows.Close()
	}

	friends := make([]friendResponse, 0)
	if ownerID.Bytes == userID.Bytes && memberStatus == "accepted" {
		friends, err = h.eligibleFriends(r.Context(), userID, eventID)
		if err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Prietenii nu au putut fi incarcati")
			return
		}
	}
	router.RespondWithJSON(w, http.StatusOK, envelopeResponse{
		CanCreate: false, TicketValidated: validated, Group: group, EligibleFriends: friends,
	})
}

func (h *Handler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	userID, eventID, ok := requestUUIDs(r)
	if !ok {
		router.RespondWithError(w, http.StatusBadRequest, "Cerere invalida")
		return
	}
	if !h.allowUserAction(w, r, "safety_group_create_user", userID, eventID, 5, time.Hour) {
		return
	}
	var request createRequest
	if !router.DecodeJSON(w, r, &request, maxMessageBytes) {
		return
	}
	friendIDs, valid := parseUniqueUUIDs(request.FriendIDs)
	if !valid {
		router.RespondWithError(w, http.StatusBadRequest, "Poti invita cel mult 7 prieteni valizi")
		return
	}
	if len(friendIDs) == 0 {
		router.RespondWithError(w, http.StatusBadRequest, "Selecteaza cel putin un prieten pentru grup")
		return
	}

	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Grupul nu a putut fi creat")
		return
	}
	defer tx.Rollback(r.Context())

	paid, err := h.hasPaidTicket(r.Context(), tx, userID, eventID)
	if err != nil || !paid {
		router.RespondWithError(w, http.StatusForbidden, "Ai nevoie de un bilet platit pentru acest eveniment")
		return
	}
	var eventTitle string
	var expiresAt time.Time
	if err := tx.QueryRow(r.Context(), `
		SELECT title, end_time + interval '24 hours' FROM events
		WHERE id = $1 AND end_time + interval '24 hours' > CURRENT_TIMESTAMP
		FOR UPDATE`, eventID).Scan(&eventTitle, &expiresAt); err != nil {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul nu mai permite crearea unui grup")
		return
	}

	for _, friendID := range friendIDs {
		if friendID.Bytes == userID.Bytes {
			router.RespondWithError(w, http.StatusBadRequest, "Lista de prieteni este invalida")
			return
		}
		var eligible bool
		err := tx.QueryRow(r.Context(), `
			SELECT EXISTS (
				SELECT 1 FROM friendships friendship
				WHERE friendship.status = 'accepted'
				  AND ((friendship.user_id = $1 AND friendship.friend_id = $2)
				    OR (friendship.user_id = $2 AND friendship.friend_id = $1))
			) AND EXISTS (
				SELECT 1 FROM tickets ticket
				JOIN orders order_row ON order_row.id = ticket.order_id
				WHERE order_row.event_id = $3 AND order_row.status = 'completed'
				  AND (ticket.user_id = $2 OR (ticket.user_id IS NULL AND order_row.user_id = $2))
			)`, userID, friendID, eventID).Scan(&eligible)
		if err != nil || !eligible {
			router.RespondWithError(w, http.StatusForbidden, "Poti invita doar prieteni cu bilet la acest eveniment")
			return
		}
	}

	var groupID pgtype.UUID
	err = tx.QueryRow(r.Context(), `
		INSERT INTO event_safety_groups (event_id, owner_id, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id`, eventID, userID, expiresAt).Scan(&groupID)
	if err != nil {
		var databaseErr *pgconn.PgError
		if errors.As(err, &databaseErr) && databaseErr.Code == "23505" {
			router.RespondWithError(w, http.StatusConflict, "Ai deja un grup pentru acest eveniment")
		} else {
			router.RespondWithError(w, http.StatusInternalServerError, "Grupul nu a putut fi creat")
		}
		return
	}
	if _, err = tx.Exec(r.Context(), `
		INSERT INTO event_safety_group_members (group_id, event_id, user_id, status, invited_by, responded_at)
		VALUES ($1, $2, $3, 'accepted', $3, CURRENT_TIMESTAMP)`, groupID, eventID, userID); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Grupul nu a putut fi creat")
		return
	}
	for _, friendID := range friendIDs {
		if _, err = tx.Exec(r.Context(), `
			INSERT INTO event_safety_group_members (group_id, event_id, user_id, status, invited_by)
			VALUES ($1, $2, $3, 'pending', $4)`, groupID, eventID, friendID, userID); err != nil {
			router.RespondWithError(w, http.StatusConflict, "Un prieten selectat este deja intr-un grup")
			return
		}
		if _, err = tx.Exec(r.Context(), `
			INSERT INTO notifications (user_id, type, title, body, event_id, actor_id, expires_at)
			VALUES ($1, 'safety_group_invite', 'Invitatie in grupul evenimentului',
			        'Ai fost invitat intr-un grup pentru ' || $2, $3, $4, $5)`,
			friendID, eventTitle, eventID, userID, expiresAt); err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Invitatiile nu au putut fi create")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Grupul nu a putut fi creat")
		return
	}
	router.RespondWithJSON(w, http.StatusCreated, map[string]string{"id": common.UUIDToString(groupID)})
}

func (h *Handler) HandleRespond(w http.ResponseWriter, r *http.Request) {
	userID, eventID, ok := requestUUIDs(r)
	if !ok {
		router.RespondWithError(w, http.StatusBadRequest, "Cerere invalida")
		return
	}
	if !h.allowUserAction(w, r, "safety_group_respond_user", userID, eventID, 20, time.Hour) {
		return
	}
	var request respondRequest
	if !router.DecodeJSON(w, r, &request, 256) {
		return
	}
	if request.Status != "accepted" && request.Status != "declined" {
		router.RespondWithError(w, http.StatusBadRequest, "Raspuns invalid")
		return
	}
	if request.Status == "accepted" {
		paid, err := h.hasPaidTicket(r.Context(), h.DB, userID, eventID)
		if err != nil || !paid {
			router.RespondWithError(w, http.StatusForbidden, "Biletul pentru eveniment nu este disponibil")
			return
		}
		result, err := h.DB.Exec(r.Context(), `
			UPDATE event_safety_group_members member
			SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
			FROM event_safety_groups group_row
			WHERE member.group_id = group_row.id AND member.event_id = $1 AND member.user_id = $2
			  AND member.status = 'pending' AND group_row.expires_at > CURRENT_TIMESTAMP`, eventID, userID)
		if err != nil || result.RowsAffected() != 1 {
			router.RespondWithError(w, http.StatusConflict, "Invitatia nu mai este disponibila")
			return
		}
	} else {
		result, err := h.DB.Exec(r.Context(), `
			DELETE FROM event_safety_group_members member
			USING event_safety_groups group_row
			WHERE member.group_id = group_row.id AND member.event_id = $1 AND member.user_id = $2
			  AND member.status = 'pending' AND group_row.expires_at > CURRENT_TIMESTAMP`, eventID, userID)
		if err != nil || result.RowsAffected() != 1 {
			router.RespondWithError(w, http.StatusConflict, "Invitatia nu mai este disponibila")
			return
		}
	}
	_, _ = h.DB.Exec(r.Context(), `
		DELETE FROM notifications WHERE user_id = $1 AND event_id = $2 AND type = 'safety_group_invite'`, userID, eventID)
	router.RespondWithJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) acceptedGroup(ctx context.Context, userID, eventID pgtype.UUID) (pgtype.UUID, time.Time, error) {
	var groupID pgtype.UUID
	var expiresAt time.Time
	err := h.DB.QueryRow(ctx, `
		SELECT member.group_id, group_row.expires_at
		FROM event_safety_group_members member
		JOIN event_safety_groups group_row ON group_row.id = member.group_id
		WHERE member.event_id = $1 AND member.user_id = $2 AND member.status = 'accepted'
		  AND group_row.expires_at > CURRENT_TIMESTAMP`, eventID, userID).Scan(&groupID, &expiresAt)
	return groupID, expiresAt, err
}

func (h *Handler) insertMessage(w http.ResponseWriter, r *http.Request, kind, fallback string, requireValidated bool) {
	userID, eventID, ok := requestUUIDs(r)
	if !ok {
		router.RespondWithError(w, http.StatusBadRequest, "Cerere invalida")
		return
	}
	limit, window, scope := 60, time.Minute, "safety_group_message_user"
	if kind == "help" {
		limit, window, scope = 3, 5*time.Minute, "safety_group_help_user"
	} else if kind == "help_resolved" {
		limit, window, scope = 10, 5*time.Minute, "safety_group_help_resolved_user"
	}
	if !h.allowUserAction(w, r, scope, userID, eventID, limit, window) {
		return
	}
	var request messageRequest
	if !router.DecodeJSON(w, r, &request, maxMessageBytes) {
		return
	}
	content := strings.TrimSpace(request.Content)
	if content == "" {
		content = fallback
	}
	if len([]rune(content)) > 500 || content == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Mesajul trebuie sa aiba cel mult 500 de caractere")
		return
	}
	paid, err := h.hasPaidTicket(r.Context(), h.DB, userID, eventID)
	if err != nil || !paid {
		router.RespondWithError(w, http.StatusForbidden, "Ai nevoie de un bilet platit pentru acest eveniment")
		return
	}
	if requireValidated {
		validated, err := h.hasValidatedTicket(r.Context(), userID, eventID)
		if err != nil || !validated {
			router.RespondWithError(w, http.StatusForbidden, "Butonul de ajutor devine activ dupa validarea biletului")
			return
		}
	}
	groupID, expiresAt, err := h.acceptedGroup(r.Context(), userID, eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusForbidden, "Nu esti membru activ al grupului")
		return
	}
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Mesajul nu a putut fi trimis")
		return
	}
	defer tx.Rollback(r.Context())

	// Serialize messages from the same member. This makes the help cooldown
	// atomic even when the client retries several requests concurrently.
	var locked bool
	if err := tx.QueryRow(r.Context(), `
		SELECT TRUE
		FROM event_safety_group_members
		WHERE group_id = $1 AND user_id = $2 AND status = 'accepted'
		FOR UPDATE`, groupID, userID).Scan(&locked); err != nil || !locked {
		router.RespondWithError(w, http.StatusForbidden, "Nu esti membru activ al grupului")
		return
	}
	if kind == "help" {
		var recentlySent bool
		if err := tx.QueryRow(r.Context(), `
			SELECT EXISTS (
				SELECT 1 FROM event_safety_messages
				WHERE group_id = $1 AND sender_id = $2 AND kind = 'help'
				  AND created_at > CURRENT_TIMESTAMP - interval '30 seconds'
			)`, groupID, userID).Scan(&recentlySent); err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Alerta nu a putut fi trimisa")
			return
		}
		if recentlySent {
			router.RespondWithError(w, http.StatusTooManyRequests, "Alerta a fost deja trimisa. Asteapta cateva secunde")
			return
		}
	}

	var messageID pgtype.UUID
	var createdAt time.Time
	err = tx.QueryRow(r.Context(), `
		INSERT INTO event_safety_messages (group_id, event_id, sender_id, kind, content, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at`, groupID, eventID, userID, kind, content, expiresAt).Scan(&messageID, &createdAt)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Mesajul nu a putut fi trimis")
		return
	}
	if kind == "help" || kind == "help_resolved" {
		title := "Un prieten are nevoie de ajutor"
		if kind == "help_resolved" {
			title = "Prietenul tau este in siguranta"
		}
		result, notificationErr := tx.Exec(r.Context(), `
			INSERT INTO notifications (user_id, type, title, body, event_id, actor_id, expires_at)
			SELECT member.user_id, $1, $2, $3, $4, $5, $6
			FROM event_safety_group_members member
			WHERE member.group_id = $7 AND member.status = 'accepted' AND member.user_id <> $5
			  AND EXISTS (
				SELECT 1
				FROM tickets ticket
				JOIN orders order_row ON order_row.id = ticket.order_id
				WHERE order_row.event_id = $4 AND order_row.status = 'completed'
				  AND (ticket.user_id = member.user_id
				    OR (ticket.user_id IS NULL AND order_row.user_id = member.user_id))
			  )`,
			"safety_"+kind, title, content, eventID, userID, expiresAt, groupID)
		if notificationErr != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Prietenii nu au putut fi alertati")
			return
		}
		if result.RowsAffected() == 0 {
			router.RespondWithError(w, http.StatusConflict, "Invita si asteapta acceptarea unui prieten inainte de a trimite alerta")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Mesajul nu a putut fi trimis")
		return
	}
	router.RespondWithJSON(w, http.StatusCreated, map[string]string{
		"id": common.UUIDToString(messageID), "createdAt": createdAt.UTC().Format(time.RFC3339),
	})
}

func (h *Handler) HandleMessage(w http.ResponseWriter, r *http.Request) {
	h.insertMessage(w, r, "message", "", false)
}

func (h *Handler) HandleHelp(w http.ResponseWriter, r *http.Request) {
	h.insertMessage(w, r, "help", "Am nevoie de ajutor. Te rog verifica daca sunt bine.", true)
}

func (h *Handler) HandleHelpResolved(w http.ResponseWriter, r *http.Request) {
	h.insertMessage(w, r, "help_resolved", "Sunt in siguranta acum.", true)
}

// StartCleanupWorker physically removes expired safety data. The endpoint
// queries also filter expired records, so a delayed worker cannot expose them.
func (h *Handler) StartCleanupWorker(ctx context.Context) {
	cleanup := func() {
		runCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		// Event dates remain editable. Reconcile the retention deadline before
		// deleting anything so postponing an event cannot prematurely remove its group.
		if _, err := h.DB.Exec(runCtx, `
			DELETE FROM event_safety_groups group_row
			USING events event
			WHERE group_row.event_id = event.id
			  AND (event.end_time + interval '24 hours' <= CURRENT_TIMESTAMP
			    OR event.end_time + interval '24 hours' <= group_row.created_at)`); err != nil {
			log.Printf("safety group canonical expiry cleanup failed: %v", err)
			return
		}
		if _, err := h.DB.Exec(runCtx, `
			UPDATE event_safety_groups group_row
			SET expires_at = event.end_time + interval '24 hours'
			FROM events event
			WHERE group_row.event_id = event.id
			  AND event.end_time + interval '24 hours' > group_row.created_at
			  AND group_row.expires_at IS DISTINCT FROM event.end_time + interval '24 hours'`); err != nil {
			log.Printf("safety group expiry reconciliation failed: %v", err)
			return
		}
		if _, err := h.DB.Exec(runCtx, `
			UPDATE event_safety_messages message
			SET expires_at = group_row.expires_at
			FROM event_safety_groups group_row
			WHERE message.group_id = group_row.id
			  AND message.expires_at IS DISTINCT FROM group_row.expires_at`); err != nil {
			log.Printf("safety message expiry reconciliation failed: %v", err)
			return
		}
		if _, err := h.DB.Exec(runCtx, `
			UPDATE notifications notification
			SET expires_at = event.end_time + interval '24 hours'
			FROM events event
			WHERE notification.event_id = event.id
			  AND notification.type LIKE 'safety_%'
			  AND notification.expires_at IS DISTINCT FROM event.end_time + interval '24 hours'`); err != nil {
			log.Printf("safety notification expiry reconciliation failed: %v", err)
			return
		}
		if _, err := h.DB.Exec(runCtx, `DELETE FROM notifications WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP`); err != nil {
			log.Printf("safety notification cleanup failed: %v", err)
		}
		if _, err := h.DB.Exec(runCtx, `DELETE FROM event_safety_messages WHERE expires_at <= CURRENT_TIMESTAMP`); err != nil {
			log.Printf("safety message cleanup failed: %v", err)
		}
		if _, err := h.DB.Exec(runCtx, `DELETE FROM event_safety_groups WHERE expires_at <= CURRENT_TIMESTAMP`); err != nil {
			log.Printf("safety group cleanup failed: %v", err)
		}
	}
	go func() {
		cleanup()
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				cleanup()
			}
		}
	}()
}
