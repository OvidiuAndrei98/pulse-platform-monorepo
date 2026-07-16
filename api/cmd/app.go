package app

import (
	"context"
	"fmt"
	"os"
	db "pulse-api/db/generated"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Application struct {
	Queries *db.Queries
	Pool    *pgxpool.Pool
}

// InitApplication configurează pool-ul de conexiuni, refolosit și local și în Lambda
func InitApplication() (*Application, error) {

	dbHost := os.Getenv("DB_HOST")
	if dbHost == "" {
		dbHost = "localhost"
	}

	dbPort := os.Getenv("DB_PORT")
	if dbPort == "" {
		dbPort = "5432"
	}

	dbUser := os.Getenv("DB_USER")
	if dbUser == "" {
		dbUser = "pulse_user"
	}

	dbPassword := os.Getenv("DB_PASSWORD")
	if dbPassword == "" {
		dbPassword = "Codelab1233q!"
	}

	dbName := os.Getenv("DB_NAME")
	if dbName == "" {
		dbName = "pulse_db"
	}

	dbSSLMode := os.Getenv("DB_SSLMODE")
	if dbSSLMode == "" {
		dbSSLMode = "disable"
	}

	dbURL := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s", dbUser, dbPassword, dbHost, dbPort, dbName, dbSSLMode)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		return nil, err
	}

	// Setări sigure atât pentru instanțe persistente, cât și pentru ciclul de viață Lambda
	config.MaxConns = 15
	config.MinConns = 2
	config.MaxConnIdleTime = 15 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}

	return &Application{
		Queries: db.New(pool),
		Pool:    pool,
	}, nil
}
