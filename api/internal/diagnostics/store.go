package diagnostics

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ Pool *pgxpool.Pool }

func (s PostgresStore) Save(ctx context.Context, r Report, key string) error {
	body, err := json.Marshal(r)
	if err != nil {
		return err
	}
	// A retried report is idempotent across instances and interrupted responses.
	_, err = s.Pool.Exec(ctx, `INSERT INTO client_error_reports(id,fingerprint,platform,app_version,report) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`, r.ID, key, r.Platform, r.AppVersion, body)
	return err
}
func (s PostgresStore) List(ctx context.Context, platform string, cursor *Cursor) ([]Entry, error) {
	query := `SELECT report,received_at,fingerprint FROM client_error_reports WHERE received_at > now()-interval '30 days'`
	args := []any{}
	if platform != "" {
		args = append(args, platform)
		query += fmt.Sprintf(" AND platform=$%d", len(args))
	}
	if cursor != nil {
		args = append(args, cursor.Time, cursor.ID)
		query += fmt.Sprintf(" AND (received_at,id)<($%d,$%d::uuid)", len(args)-1, len(args))
	}
	query += ` ORDER BY received_at DESC,id DESC LIMIT 26`
	rows, err := s.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Entry{}
	for rows.Next() {
		var row Entry
		var raw []byte
		if err = rows.Scan(&raw, &row.ReceivedAt, &row.Fingerprint); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(raw, &row.Report); err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, rows.Err()
}
func (s PostgresStore) Cleanup(ctx context.Context) error {
	// Small indexed batches avoid a long cleanup transaction during events.
	_, err := s.Pool.Exec(ctx, `DELETE FROM client_error_reports WHERE id IN (SELECT id FROM client_error_reports WHERE received_at < now()-interval '30 days' ORDER BY received_at LIMIT 5000)`)
	return err
}
