package main

import (
	"context"
	"log"
	app "pulse-api/cmd"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

// Păstrăm referința la nivel global în fișier pentru a profita de "Global Context" în Lambda.
// Conexiunea la baza de date rămâne activă între execuții succesive (Warm Starts).
var coreApp *app.Application

func init() {
	var err error
	coreApp, err = app.InitApplication()
	if err != nil {
		log.Fatalf("Eroare la inițializarea bazei de date în faza de init Lambda: %v", err)
	}
}

// Handler procesează direct cererea venită de la un AWS API Gateway (v2 / HTTP API)
func Handler(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	log.Printf("Request primit pe ruta: %s %s", request.RequestContext.HTTP.Method, request.RequestContext.HTTP.Path)

	// Exemplu de rutare primit direct din proprietățile evenimentului AWS
	switch request.RequestContext.HTTP.Path {
	case "/health":
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 200,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       `{"status": "ok", "mode": "aws-lambda"}`,
		}, nil

	default:
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 404,
			Body:       `{"message": "Ruta nu a fost găsită în Lambda"}`,
		}, nil
	}
}

func main() {
	// Pornim runtime-ul nativ AWS Lambda
	lambda.Start(Handler)
}