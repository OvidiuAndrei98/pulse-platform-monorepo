package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	app "pulse-api/cmd"
	"time"
)

func main() {
	coreApp, err := app.InitApplication()
	if err != nil {
		log.Fatalf("Eroare la inițializarea bazei de date: %v", err)
	}
	defer coreApp.Pool.Close()
	coreApp.StartEventExpiryWorker(context.Background())
	coreApp.StartPromotionReservationExpiryWorker(context.Background())

	// Citim routerul comun
	router := coreApp.BuildRouter()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		WriteTimeout: 15 * time.Second,
		ReadTimeout:  15 * time.Second,
	}

	fmt.Printf("[LOCAL] Serverul rulează pe http://localhost:%s/api/v1\n", port)
	log.Fatal(server.ListenAndServe())
}
