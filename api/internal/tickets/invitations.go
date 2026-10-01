package tickets

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"

	db "pulse-api/db/generated"
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
	Quantity     int32  `json:"quantity"`
}

func (h *Handler) validateInvitation(ctx context.Context, eventID pgtype.UUID, hash string) (map[string]any, bool, error) {
	invitation, err := h.Queries.GetInvitationForValidation(ctx, db.GetInvitationForValidationParams{
		EventID: eventID, ValidationHash: hash,
	})
	if err == pgx.ErrNoRows {
		return nil, false, nil
	}
	if err != nil {
		return nil, true, err
	}
	status := "valid"
	validatedAt := invitation.ValidatedAt
	if invitation.RevokedAt.Valid {
		status = "revoked"
	} else if validatedAt.Valid {
		status = "already_validated"
	} else {
		validatedAt, err = h.Queries.MarkInvitationValidated(ctx, invitation.ID)
		if err != nil {
			status = "already_validated"
		}
	}
	return map[string]any{"ticketId": common.UUIDToString(invitation.ID), "ticketType": invitation.TicketType, "eventId": common.UUIDToString(eventID), "status": status, "validatedAt": validatedAt.Time, "invitationLabel": invitation.Label}, true, nil
}

func invitationHash() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func invitationUUID() (pgtype.UUID, error) {
	var id pgtype.UUID
	if _, err := rand.Read(id.Bytes[:]); err != nil {
		return id, err
	}
	id.Bytes[6] = (id.Bytes[6] & 0x0f) | 0x40
	id.Bytes[8] = (id.Bytes[8] & 0x3f) | 0x80
	id.Valid = true
	return id, nil
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
	event, err := h.Queries.GetEventWithStats(r.Context(), eventID)
	if err != nil || event.ExternalTicketUrl.Valid {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul foloseste o platforma externa pentru bilete")
		return
	}
	var req createInvitationRequest
	if json.NewDecoder(r.Body).Decode(&req) != nil || strings.TrimSpace(req.Label) == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Eticheta invitatiei este obligatorie")
		return
	}
	if req.Quantity == 0 {
		req.Quantity = 1
	}
	if req.Quantity < 1 || req.Quantity > 100 {
		router.RespondWithError(w, http.StatusBadRequest, "Cantitatea trebuie sa fie intre 1 si 100")
		return
	}
	var ticketTypeID pgtype.UUID
	if req.TicketTypeID == "" || ticketTypeID.Scan(req.TicketTypeID) != nil || !ticketTypeID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "Tip de bilet invalid")
		return
	}
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Invitatiile nu au putut fi generate")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)
	var lockedExternalURL pgtype.Text
	if err := tx.QueryRow(r.Context(), `
		SELECT external_ticket_url
		FROM events
		WHERE id = $1 AND organizer_id = $2
		FOR SHARE`, eventID, userID).Scan(&lockedExternalURL); err != nil {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul nu mai poate fi modificat")
		return
	}
	if lockedExternalURL.Valid {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul foloseste o platforma externa pentru bilete")
		return
	}
	ticketType := ""
	if ticketTypeID.Valid {
		ticketType, err = qtx.GetInvitationTicketType(r.Context(), db.GetInvitationTicketTypeParams{ID: ticketTypeID, EventID: eventID})
		if err != nil {
			router.RespondWithError(w, http.StatusBadRequest, "Tipul de bilet nu apartine evenimentului")
			return
		}
	}
	batchID, err := invitationUUID()
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Invitatiile nu au putut fi generate")
		return
	}
	label := strings.TrimSpace(req.Label)
	items := make([]map[string]any, 0, req.Quantity)
	for index := int32(1); index <= req.Quantity; index++ {
		hash, hashErr := invitationHash()
		if hashErr != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Invitatiile nu au putut fi generate")
			return
		}
		created, createErr := qtx.CreateInvitationTicket(r.Context(), db.CreateInvitationTicketParams{
			EventID: eventID, TicketTypeID: ticketTypeID, CreatedBy: userID, Label: label,
			ValidationHash: hash, BatchID: batchID, BatchIndex: index,
		})
		if createErr != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Invitatiile nu au putut fi generate")
			return
		}
		items = append(items, map[string]any{
			"id": common.UUIDToString(created.ID), "label": label, "validationHash": hash,
			"ticketType": ticketType, "status": "active", "createdAt": created.CreatedAt.Time,
			"batchId": common.UUIDToString(batchID), "batchIndex": index,
		})
	}
	if err = tx.Commit(r.Context()); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Invitatiile nu au putut fi generate")
		return
	}
	router.RespondWithJSON(w, http.StatusCreated, items)
}

func (h *Handler) HandleListInvitations(w http.ResponseWriter, r *http.Request) {
	_, eventID, ok := h.organizerEventIDs(r)
	if !ok {
		router.RespondWithError(w, 403, "Acces interzis")
		return
	}
	rows, err := h.Queries.ListInvitationsForEvent(r.Context(), eventID)
	if err != nil {
		router.RespondWithError(w, 500, "Invitatiile nu au putut fi incarcate")
		return
	}
	items := []map[string]any{}
	for _, invitation := range rows {
		status := "active"
		if invitation.RevokedAt.Valid {
			status = "revoked"
		} else if invitation.ValidatedAt.Valid {
			status = "used"
		}
		items = append(items, map[string]any{
			"id": common.UUIDToString(invitation.ID), "label": invitation.Label,
			"validationHash": invitation.ValidationHash, "ticketType": invitation.TicketType,
			"status": status, "createdAt": invitation.CreatedAt.Time,
			"batchId": common.UUIDToString(invitation.BatchID), "batchIndex": invitation.BatchIndex,
		})
	}
	router.RespondWithJSON(w, 200, items)
}

func (h *Handler) HandleRevokeInvitation(w http.ResponseWriter, r *http.Request) {
	_, eventID, ok := h.organizerEventIDs(r)
	if !ok {
		router.RespondWithError(w, 403, "Acces interzis")
		return
	}
	var invitationID pgtype.UUID
	if invitationID.Scan(chi.URLParam(r, "invitationId")) != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Invitatie invalida")
		return
	}
	rows, err := h.Queries.RevokeInvitationTicket(r.Context(), db.RevokeInvitationTicketParams{ID: invitationID, EventID: eventID})
	if err != nil || rows == 0 {
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
	var invitationID pgtype.UUID
	if invitationID.Scan(chi.URLParam(r, "invitationId")) != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Invitatie invalida")
		return
	}
	rows, err := h.Queries.DeleteRevokedInvitationTicket(r.Context(), db.DeleteRevokedInvitationTicketParams{ID: invitationID, EventID: eventID})
	if err != nil || rows == 0 {
		router.RespondWithError(w, http.StatusConflict, "Doar invitatiile anulate pot fi sterse")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
