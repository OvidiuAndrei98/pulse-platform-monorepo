package router

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Structura temporară de răspuns, până legăm baza de date
type MapPinResponse struct {
	ID                   string    `json:"id"`
	Title                string    `json:"title"`
	ClubName             string    `json:"clubName"`
	Date                 time.Time `json:"date"`
	Latitude             float64   `json:"latitude"`
	Longitude            float64   `json:"longitude"`
	RemainingEventsCount int       `json:"remainingEventsCount"`
}

func SetupRouter() http.Handler {
	r := chi.NewRouter()

	// Middleware-uri standard pentru monitorizare și securitate
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Ruta de test pentru a verifica dacă serverul e pornit
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status": "healthy", "app": "pulse"}`))
	})

	// Grupul de rute publice (Aplicația de mobil / Web)
	r.Route("/public", func(r chi.Router) {
		r.Get("/events/map", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			
			// Mock data ca să vedem că funcționează
			pins := []MapPinResponse{
				{
					ID:                   "evt_100",
					Title:                "Retro Night Party",
					ClubName:             "Pulse Club Bucharest",
					Date:                 time.Now().Add(24 * time.Hour),
					Latitude:             44.432254,
					Longitude:            26.106261,
					RemainingEventsCount: 3,
				},
			}

			json.NewEncoder(w).Encode(pins)
		})
	})

	return r
}