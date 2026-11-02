package tickets

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	db "pulse-api/db/generated"
	"strings"
	"testing"
	"time"
)

func TestInvitationAdmissionHonorsCancellationEndAndDelayedOffline(t *testing.T) {
	dsn := os.Getenv("TICKET_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires migrated local spottr_ticket_test")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil || cfg.ConnConfig.Host != "127.0.0.1" || cfg.ConnConfig.Database != "spottr_ticket_test" {
		t.Fatal("refusing non-isolated database")
	}
	ctx := context.Background()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var owner, event, invitation pgtype.UUID
	suffix := fmt.Sprint(time.Now().UnixNano())
	if err = pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active) VALUES($1,$2,'test-only','organizer',TRUE) RETURNING id`, "invitation-"+suffix, "invitation-"+suffix+"@example.invalid").Scan(&owner); err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	if err = pool.QueryRow(ctx, `INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status) VALUES($1,'Invitation admission','house','Venue','Bucuresti','social',44,26,now()-interval '1 hour',now()+interval '1 hour',$2,'published') RETURNING id`, owner, "invitation-"+suffix).Scan(&event); err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(ctx, `DELETE FROM events WHERE id=$1`, event)
	hash := strings.Repeat("c", 64)
	if err = pool.QueryRow(ctx, `INSERT INTO invitation_tickets(event_id,created_by,label,validation_hash) VALUES($1,$2,'QA invitation',$3) RETURNING id`, event, owner, hash).Scan(&invitation); err != nil {
		t.Fatal(err)
	}
	q := db.New(pool)
	for _, status := range []string{"cancel_pending", "refunding", "cancelled", "completed"} {
		t.Run(status, func(t *testing.T) {
			end := time.Now().Add(time.Hour)
			if status == "completed" {
				end = time.Now().Add(-time.Minute)
			}
			if _, e := pool.Exec(ctx, `UPDATE events SET status=$2,end_time=$3 WHERE id=$1`, event, status, end); e != nil {
				t.Fatal(e)
			}
			result, handled, e := validateInvitation(ctx, q, event, hash, time.Now())
			if e != nil || !handled || result["status"] != "invalid" {
				t.Fatal("closed event invitation accepted", result, e)
			}
			var stamp pgtype.Timestamptz
			if e = pool.QueryRow(ctx, `SELECT validated_at FROM invitation_tickets WHERE id=$1`, invitation).Scan(&stamp); e != nil || stamp.Valid {
				t.Fatal("closed invitation consumed")
			}
		})
	}
	// The same credential may still reconcile an actual scan made before end.
	scanAt := time.Now().Add(-2 * time.Minute)
	result, handled, err := validateInvitation(ctx, q, event, hash, scanAt)
	if err != nil || !handled || result["status"] != "valid" {
		t.Fatal("delayed invitation scan rejected", result, err)
	}
	result, _, err = validateInvitation(ctx, q, event, hash, scanAt)
	if err != nil || result["status"] != "already_validated" {
		t.Fatal("delayed retry was not idempotent", result, err)
	}
	// Test the atomic predicate independently of the initial read: a cancellation
	// committed between read and mark must prevent consumption.
	if _, err = pool.Exec(ctx, `UPDATE invitation_tickets SET validated_at=NULL WHERE id=$1`, invitation); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE events SET status='cancelled' WHERE id=$1`, event); err != nil {
		t.Fatal(err)
	}
	if _, err = q.MarkInvitationValidated(ctx, db.MarkInvitationValidatedParams{ID: invitation, AdmissionAt: pgtype.Timestamptz{Time: scanAt, Valid: true}}); err == nil {
		t.Fatal("atomic mark ignored cancellation")
	}
}
