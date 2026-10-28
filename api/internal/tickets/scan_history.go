package tickets

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type scanHistoryCursor struct {
	At time.Time `json:"at"`
	ID string    `json:"id"`
}

func parseScanHistoryPage(r *http.Request) (string, int, *scanHistoryCursor, error) {
	q := r.URL.Query()
	scope := q.Get("scope")
	if scope == "" {
		scope = "all"
	}
	limit := 30
	var err error
	if q.Has("limit") {
		limit, err = strconv.Atoi(q.Get("limit"))
	}
	if err != nil || limit < 1 || limit > 100 || (scope != "all" && scope != "mine") {
		return "", 0, nil, errors.New("invalid history page")
	}
	var cursor *scanHistoryCursor
	if q.Has("cursor") {
		raw := q.Get("cursor")
		if len(raw) == 0 || len(raw) > 256 {
			return "", 0, nil, errors.New("invalid cursor")
		}
		decoded, err := base64.RawURLEncoding.DecodeString(raw)
		var value scanHistoryCursor
		var id pgtype.UUID
		if err != nil || json.Unmarshal(decoded, &value) != nil || value.At.IsZero() || id.Scan(value.ID) != nil || !id.Valid {
			return "", 0, nil, errors.New("invalid cursor")
		}
		cursor = &value
	}
	return scope, limit, cursor, nil
}

// Preserve the existing Next.js endpoint while offering both scopes and
// cursor pagination on /scans. A supplied user ID never controls "mine".
func (h *Handler) HandleListMyValidationScans(w http.ResponseWriter, r *http.Request) {
	h.listValidationScans(w, r, "mine", 20, nil)
}

func (h *Handler) HandleListValidationScans(w http.ResponseWriter, r *http.Request) {
	scope, limit, cursor, err := parseScanHistoryPage(r)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Pagina de istoric este invalida")
		return
	}
	h.listValidationScans(w, r, scope, limit, cursor)
}

func (h *Handler) listValidationScans(w http.ResponseWriter, r *http.Request, scope string, limit int, cursor *scanHistoryCursor) {
	ctx := r.Context()
	userString, err := auth.GetUserIDFromContext(ctx)
	var userID, eventID pgtype.UUID
	if err != nil || userID.Scan(userString) != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	if eventID.Scan(chi.URLParam(r, "id")) != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}
	_, allowed, err := h.canValidateEvent(ctx, eventID, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Permisiunile nu au putut fi verificate")
		return
	}
	if !allowed {
		router.RespondWithError(w, http.StatusForbidden, "Nu ai permisiunea sa vezi scanarile acestui eveniment")
		return
	}
	var beforeAt pgtype.Timestamptz
	var beforeID pgtype.UUID
	if cursor != nil {
		beforeAt = pgtype.Timestamptz{Time: cursor.At, Valid: true}
		_ = beforeID.Scan(cursor.ID)
	}
	// Count and page share a database snapshot, including an empty final page.
	// The stable (timestamp, UUID) cursor avoids skips/duplicates when another
	// scanner validates a ticket while the user is scrolling older results.
	rows, err := h.DB.Query(ctx, `
		WITH matching AS NOT MATERIALIZED (
			SELECT t.id, t.ticket_type_id, t.validated_at, t.validated_by_user_id, t.validated_by_scanner_access_id
			FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id
			WHERE tt.event_id = $1 AND t.is_validated = TRUE AND t.validated_at IS NOT NULL
			  AND ($2::boolean = FALSE OR t.validated_by_user_id = $3)
		), page AS (
			SELECT * FROM matching
			WHERE $4::timestamptz IS NULL OR (validated_at, id) < ($4, $5::uuid)
			ORDER BY validated_at DESC, id DESC LIMIT $6
		)
		SELECT total.n, p.id, tt.name, p.validated_at, p.validated_by_user_id,
		       p.validated_by_scanner_access_id, COALESCE(u.username, a.label, '')
		FROM (SELECT COUNT(*) AS n FROM matching) total
		LEFT JOIN page p ON TRUE
		LEFT JOIN ticket_types tt ON tt.id = p.ticket_type_id
		LEFT JOIN users u ON u.id = p.validated_by_user_id
		LEFT JOIN event_scanner_access a ON a.id = p.validated_by_scanner_access_id
		ORDER BY p.validated_at DESC, p.id DESC`, eventID, scope == "mine", userID, beforeAt, beforeID, limit+1)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Istoricul scanarilor nu a putut fi incarcat")
		return
	}
	defer rows.Close()
	response := ValidationScanHistoryResponse{Scans: []ValidationScanHistoryItem{}}
	var last scanHistoryCursor
	for rows.Next() {
		var ticketID, actorID, accessID pgtype.UUID
		var ticketType pgtype.Text
		var at pgtype.Timestamptz
		var name string
		if err := rows.Scan(&response.TotalScans, &ticketID, &ticketType, &at, &actorID, &accessID, &name); err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Istoricul scanarilor nu a putut fi citit")
			return
		}
		if !ticketID.Valid {
			continue
		}
		if len(response.Scans) == limit {
			encoded, _ := json.Marshal(last)
			response.NextCursor = base64.RawURLEncoding.EncodeToString(encoded)
			continue
		}
		actor := ValidationScanActor{Name: name, Kind: "unknown"}
		if actorID.Valid {
			actor.UserID = common.UUIDToString(actorID)
			actor.Kind = "user"
		}
		if accessID.Valid {
			actor.ScannerAccessID = common.UUIDToString(accessID)
			actor.Kind = "access"
		}
		last = scanHistoryCursor{At: at.Time, ID: common.UUIDToString(ticketID)}
		response.Scans = append(response.Scans, ValidationScanHistoryItem{
			TicketID: last.ID, TicketType: ticketType.String,
			ValidatedAt: at.Time.UTC().Format(time.RFC3339Nano), ScannedBy: actor,
		})
	}
	if rows.Err() != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Istoricul scanarilor nu a putut fi citit")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	router.RespondWithJSON(w, http.StatusOK, response)
}
