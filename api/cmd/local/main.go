package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	app "pulse-api/cmd"
	"syscall"
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
	workerCtx, cancelWorkers := context.WithCancel(context.Background())
	defer cancelWorkers()
	coreApp.StartEventExpiryWorker(workerCtx)
	coreApp.StartPromotionReservationExpiryWorker(workerCtx)
	coreApp.StartInvoicingWorker(workerCtx)
	coreApp.StartRefundWorker(workerCtx)
	coreApp.StartCheckoutReconciliationWorker(workerCtx)
	coreApp.StartAbuseProtectionWorker(workerCtx)
	coreApp.StartSafetyGroupCleanupWorker(workerCtx)
	coreApp.StartDiagnosticsCleanupWorker(workerCtx)
	coreApp.StartUserMediaDeletionWorker(workerCtx)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:    ":" + port,
		Handler: router,
		// Let the router's 60s context deadline produce a response before the
		// socket closes. Header/body limits remain deliberately shorter.
		WriteTimeout:      65 * time.Second,
		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	shutdown, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	drained := make(chan struct{})
	go func() {
		<-shutdown.Done()
		cancelWorkers()
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			_ = server.Close()
		}
		close(drained)
	}()

	fmt.Printf("[LOCAL] Serverul rulează pe http://localhost:%s/api/v1\n", port)
	if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Printf("HTTP server stopped: %v", err)
		return
	}
	<-drained
}
