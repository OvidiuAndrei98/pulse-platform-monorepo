package tickets

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"

	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type createInvitationRequest struct {
	Label        string `json:"label"`
	TicketTypeID string `json:"ticketTypeId"`
}

func (h *Handler) validateInvitation(ctx context.Context, eventID pgtype.UUID, hash string) (map[string]any, bool, error) {
	var id pgtype.UUID
	var label, ticketType string
	var validatedAt, revokedAt pgtype.Timestamptz
	err := h.DB.QueryRow(ctx, `SELECT i.id,i.label,COALESCE(tt.name,''),i.validated_at,i.revoked_at FROM invitation_tickets i LEFT JOIN ticket_types tt ON tt.id=i.ticket_type_id WHERE i.event_id=$1 AND i.validation_hash=$2`, eventID, hash).Scan(&id, &label, &ticketType, &validatedAt, &revokedAt)
	if err == pgx.ErrNoRows {
		return nil, false, nil
	}
	if err != nil {
		return nil, true, err
	}
	status := "valid"
	if revokedAt.Valid {
		status = "revoked"
	} else if validatedAt.Valid {
		status = "already_validated"
	} else {
		err = h.DB.QueryRow(ctx, `UPDATE invitation_tickets SET validated_at=CURRENT_TIMESTAMP WHERE id=$1 AND validated_at IS NULL AND revoked_at IS NULL RETURNING validated_at`, id).Scan(&validatedAt)
		if err != nil {
			status = "already_validated"
		}
	}
	return map[string]any{"ticketId": common.UUIDToString(id), "ticketType": ticketType, "eventId": common.UUIDToString(eventID), "status": status, "validatedAt": validatedAt.Time, "invitationLabel": label}, true, nil
}

func invitationHash() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (h *Handler) organizerEventIDs(r *http.Request) (pgtype.UUID, pgtype.UUID, bool) {
	userString, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	var userID, eventID pgtype.UUID
	if userID.Scan(userString) != nil || eventID.Scan(chi.URLParam(r, "id")) != nil {
		return userID, eventID, false
	}
	event, err := h.Queries.GetEventWithStats(r.Context(), eventID)
	return userID, eventID, err == nil && event.OrganizerID == userID
}

func (h *Handler) HandleCreateInvitation(w http.ResponseWriter, r *http.Request) {
	userID, eventID, ok := h.organizerEventIDs(r)
	if !ok {
		router.RespondWithError(w, http.StatusForbidden, "Nu ai permisiunea sa generezi invitatii")
		return
	}
	var req createInvitationRequest
	if json.NewDecoder(r.Body).Decode(&req) != nil || strings.TrimSpace(req.Label) == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Eticheta invitatiei este obligatorie")
		return
	}
	var ticketTypeID pgtype.UUID
	if req.TicketTypeID != "" && ticketTypeID.Scan(req.TicketTypeID) != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Tip de bilet invalid")
		return
	}
	hash, err := invitationHash()
	if err != nil {
		router.RespondWithError(w, 500, "Invitatia nu a putut fi generata")
		return
	}
	var id pgtype.UUID
	err = h.DB.QueryRow(r.Context(), `INSERT INTO invitation_tickets(event_id,ticket_type_id,created_by,label,validation_hash) SELECT $1,$2,$3,$4,$5 WHERE $2::uuid IS NULL OR EXISTS(SELECT 1 FROM ticket_types WHERE id=$2 AND event_id=$1) RETURNING id`, eventID, ticketTypeID, userID, strings.TrimSpace(req.Label), hash).Scan(&id)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Tipul de bilet nu apartine evenimentului")
		return
	}
	router.RespondWithJSON(w, http.StatusCreated, map[string]any{"id": common.UUIDToString(id), "label": strings.TrimSpace(req.Label), "validationHash": hash, "status": "active"})
}

func (h *Handler) HandleListInvitations(w http.ResponseWriter, r *http.Request) {
	_, eventID, ok := h.organizerEventIDs(r)
	if !ok {
		router.RespondWithError(w, 403, "Acces interzis")
		return
	}
	rows, err := h.DB.Query(r.Context(), `SELECT i.id,i.label,i.validation_hash,COALESCE(tt.name,''),i.validated_at,i.revoked_at,i.created_at FROM invitation_tickets i LEFT JOIN ticket_types tt ON tt.id=i.ticket_type_id WHERE i.event_id=$1 ORDER BY i.created_at DESC`, eventID)
	if err != nil {
		router.RespondWithError(w, 500, "Invitatiile nu au putut fi incarcate")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id pgtype.UUID
		var label, hash, ticketType string
		var validated, revoked, created pgtype.Timestamptz
		if rows.Scan(&id, &label, &hash, &ticketType, &validated, &revoked, &created) == nil {
			status := "active"
			if revoked.Valid {
				status = "revoked"
			} else if validated.Valid {
				status = "used"
			}
			items = append(items, map[string]any{"id": common.UUIDToString(id), "label": label, "validationHash": hash, "ticketType": ticketType, "status": status, "createdAt": created.Time})
		}
	}
	router.RespondWithJSON(w, 200, items)
}

func (h *Handler) HandleRevokeInvitation(w http.ResponseWriter, r *http.Request) {
	_, eventID, ok := h.organizerEventIDs(r)
	if !ok {
		router.RespondWithError(w, 403, "Acces interzis")
		return
	}
	result, err := h.DB.Exec(r.Context(), `UPDATE invitation_tickets SET revoked_at=CURRENT_TIMESTAMP WHERE id=$1 AND event_id=$2 AND revoked_at IS NULL AND validated_at IS NULL`, chi.URLParam(r, "invitationId"), eventID)
	if err != nil || result.RowsAffected() == 0 {
		router.RespondWithError(w, 409, "Invitatia nu poate fi anulata")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) HandleDeleteInvitation(w http.ResponseWriter, r *http.Request) {
	_, eventID, ok := h.organizerEventIDs(r)
	if !ok {
		router.RespondWithError(w, http.StatusForbidden, "Acces interzis")
		return
	}
	result, err := h.DB.Exec(r.Context(), `DELETE FROM invitation_tickets WHERE id=$1 AND event_id=$2 AND revoked_at IS NOT NULL`, chi.URLParam(r, "invitationId"), eventID)
	if err != nil || result.RowsAffected() == 0 {
		router.RespondWithError(w, http.StatusConflict, "Doar invitatiile anulate pot fi sterse")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
