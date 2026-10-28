package organizer

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/router"
)

type CommissionTerms struct {
	RateBps       int32 `json:"rateBps"`
	PerTicketBani int32 `json:"perTicketBani"`
}
type CommissionStandard struct {
	CommissionTerms
	Revision int64 `json:"revision"`
}
type OrganizerCommission struct {
	OrganizerID string           `json:"organizerId"`
	CompanyName string           `json:"companyName"`
	Email       string           `json:"email"`
	Override    *CommissionTerms `json:"override"`
	Revision    int64            `json:"revision"`
}
type CommissionSettings struct {
	Standard   CommissionStandard    `json:"standard"`
	Organizers []OrganizerCommission `json:"organizers"`
}

func commissionAdmin(w http.ResponseWriter, r *http.Request) (pgtype.UUID, bool) {
	role, _ := auth.GetRoleFromContext(r.Context())
	id, _ := auth.GetUserIDFromContext(r.Context())
	var actor pgtype.UUID
	if role != "admin" || actor.Scan(id) != nil || !actor.Valid {
		router.RespondWithError(w, http.StatusForbidden, "ADMIN_REQUIRED")
		return actor, false
	}
	return actor, true
}
func validCommission(c CommissionTerms) bool {
	return c.RateBps >= 0 && c.RateBps <= 10000 && c.PerTicketBani >= 0 && c.PerTicketBani <= 100000
}
func decodeCommission(w http.ResponseWriter, r *http.Request, dest any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dest); err != nil {
		router.RespondWithError(w, 400, "INVALID_COMMISSION")
		return false
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		router.RespondWithError(w, 400, "INVALID_COMMISSION")
		return false
	}
	return true
}
func (h *Handler) HandleAdminCommissions(w http.ResponseWriter, r *http.Request) {
	if _, ok := commissionAdmin(w, r); !ok {
		return
	}
	standard, err := h.Queries.GetStandardCommission(r.Context())
	if err != nil {
		router.RespondWithError(w, 500, "COMMISSION_UNAVAILABLE")
		return
	}
	rows, err := h.Queries.ListOrganizerCommissions(r.Context())
	if err != nil {
		router.RespondWithError(w, 500, "COMMISSION_UNAVAILABLE")
		return
	}
	result := CommissionSettings{Standard: CommissionStandard{CommissionTerms{standard.RateBps, standard.PerTicketBani}, standard.Revision}, Organizers: make([]OrganizerCommission, 0, len(rows))}
	for _, row := range rows {
		item := OrganizerCommission{OrganizerID: common.UUIDToString(row.OrganizerID), CompanyName: row.CompanyName, Email: row.Email, Revision: row.Revision}
		if row.CustomRateBps.Valid {
			item.Override = &CommissionTerms{row.CustomRateBps.Int32, row.CustomPerTicketBani.Int32}
		}
		result.Organizers = append(result.Organizers, item)
	}
	w.Header().Set("Cache-Control", "no-store")
	router.RespondWithJSON(w, 200, result)
}
func (h *Handler) HandleAdminSetStandardCommission(w http.ResponseWriter, r *http.Request) {
	actor, ok := commissionAdmin(w, r)
	if !ok {
		return
	}
	var req struct {
		RateBps       *int32 `json:"rateBps"`
		PerTicketBani *int32 `json:"perTicketBani"`
		Revision      *int64 `json:"revision"`
	}
	if !decodeCommission(w, r, &req) {
		return
	}
	if req.RateBps == nil || req.PerTicketBani == nil || req.Revision == nil || *req.Revision < 1 || !validCommission(CommissionTerms{*req.RateBps, *req.PerTicketBani}) {
		router.RespondWithError(w, 400, "INVALID_COMMISSION")
		return
	}
	_, err := h.Queries.UpdateStandardCommission(r.Context(), db.UpdateStandardCommissionParams{RateBps: *req.RateBps, PerTicketBani: *req.PerTicketBani, UpdatedBy: actor, Revision: *req.Revision})
	commissionSaved(w, err)
}
func (h *Handler) HandleAdminSetOrganizerCommission(w http.ResponseWriter, r *http.Request) {
	actor, ok := commissionAdmin(w, r)
	if !ok {
		return
	}
	var id pgtype.UUID
	if id.Scan(chi.URLParam(r, "id")) != nil || !id.Valid {
		router.RespondWithError(w, 400, "INVALID_ORGANIZER")
		return
	}
	// A raw message distinguishes an explicit reset (null) from a missing field.
	var req struct {
		Override json.RawMessage `json:"override"`
		Revision *int64          `json:"revision"`
	}
	if !decodeCommission(w, r, &req) {
		return
	}
	if len(req.Override) == 0 || req.Revision == nil || *req.Revision < 0 {
		router.RespondWithError(w, 400, "INVALID_COMMISSION")
		return
	}
	var terms *struct {
		RateBps       *int32 `json:"rateBps"`
		PerTicketBani *int32 `json:"perTicketBani"`
	}
	if json.Unmarshal(req.Override, &terms) != nil || (terms != nil && (terms.RateBps == nil || terms.PerTicketBani == nil || !validCommission(CommissionTerms{*terms.RateBps, *terms.PerTicketBani}))) {
		router.RespondWithError(w, 400, "INVALID_COMMISSION")
		return
	}
	if _, err := h.Queries.GetOrganizerProfile(r.Context(), id); errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, 404, "ORGANIZER_NOT_FOUND")
		return
	} else if err != nil {
		router.RespondWithError(w, 500, "COMMISSION_UNAVAILABLE")
		return
	}
	params := db.SetOrganizerCommissionParams{OrganizerID: id, UpdatedBy: actor, ExpectedRevision: *req.Revision}
	if terms != nil {
		params.RateBps = pgtype.Int4{Int32: *terms.RateBps, Valid: true}
		params.PerTicketBani = pgtype.Int4{Int32: *terms.PerTicketBani, Valid: true}
	}
	_, err := h.Queries.SetOrganizerCommission(r.Context(), params)
	commissionSaved(w, err)
}
func commissionSaved(w http.ResponseWriter, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, 409, "COMMISSION_CHANGED")
		return
	}
	if err != nil {
		router.RespondWithError(w, 500, "COMMISSION_SAVE_FAILED")
		return
	}
	router.RespondWithJSON(w, 200, map[string]bool{"saved": true})
}
