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

	// Construirea routerului initializeaza handler-ele partajate de webhook-uri
	// si workeri, inclusiv executorul durabil de refunduri.
	router := coreApp.BuildRouter()
	coreApp.StartEventExpiryWorker(context.Background())
	coreApp.StartPromotionReservationExpiryWorker(context.Background())
	coreApp.StartInvoicingWorker(context.Background())
	coreApp.StartRefundWorker(context.Background())
	coreApp.StartCheckoutReconciliationWorker(context.Background())

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
