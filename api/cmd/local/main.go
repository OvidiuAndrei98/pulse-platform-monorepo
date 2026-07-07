package main

import (
	"fmt"
	"net/http"
	"pulse-api/internal/router"
)

func main() {
	port := ":8080"
	appRouter := router.SetupRouter()

	fmt.Printf("🚀 [PULSE API] Serverul local rulează pe http://localhost%s\n", port)
	fmt.Printf("📍 Testează harta la: http://localhost%s/public/events/map\n", port)
	
	if err := http.ListenAndServe(port, appRouter); err != nil {
		fmt.Printf("❌ Eroare la pornirea serverului: %v\n", err)
	}
}