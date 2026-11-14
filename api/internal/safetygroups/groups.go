// Package safetygroups retains only the compatibility responses for retired
// event conversations. Historical rows are neither exposed nor deleted.
package safetygroups

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"pulse-api/internal/abuse"
	"pulse-api/internal/router"
)

type Handler struct{}

func NewHandler(_ *pgxpool.Pool, _ *abuse.Protection) *Handler { return &Handler{} }
func retired(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	router.RespondWithJSON(w, http.StatusGone, map[string]string{"error": "EVENT_CHAT_RETIRED", "destination": "/friends"})
}
func (h *Handler) HandleGet(w http.ResponseWriter, r *http.Request)          { retired(w, r) }
func (h *Handler) HandleCreate(w http.ResponseWriter, r *http.Request)       { retired(w, r) }
func (h *Handler) HandleInvite(w http.ResponseWriter, r *http.Request)       { retired(w, r) }
func (h *Handler) HandleRespond(w http.ResponseWriter, r *http.Request)      { retired(w, r) }
func (h *Handler) HandleMessage(w http.ResponseWriter, r *http.Request)      { retired(w, r) }
func (h *Handler) HandleHelp(w http.ResponseWriter, r *http.Request)         { retired(w, r) }
func (h *Handler) HandleHelpResolved(w http.ResponseWriter, r *http.Request) { retired(w, r) }
