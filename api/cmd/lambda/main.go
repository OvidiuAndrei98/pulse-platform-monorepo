package main

import (
	"context"
	"pulse-api/internal/router"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	chiproxy "github.com/awslabs/aws-lambda-go-api-proxy/chi"
	"github.com/go-chi/chi/v5"
)

var chiLambda *chiproxy.ChiLambda

func init() {
	// Se execută o singură dată când AWS încarcă Lambda în memorie (Warm Up)
	// Aici inițializăm routerul nostru comun din pachetul internal
	appRouter := router.SetupRouter()
	chiLambda = chiproxy.New(appRouter.(*chi.Mux))
}

func Handler(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Adaptorul preia request-ul brut de la AWS API Gateway,
	// îl transformă într-un request HTTP normal, îl trece prin routerul nostru de Go,
	// și trimite răspunsul înapoi către AWS.
	return chiLambda.ProxyWithContext(ctx, req)
}

func main() {
	// Îi spune runtime-ului de AWS Lambda să folosească funcția noastră de Handler
	lambda.Start(Handler)
}