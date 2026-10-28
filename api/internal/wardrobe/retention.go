package wardrobe

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
)

const retentionPeriod = 7 * 24 * time.Hour
const retentionBatchEvents = 100

type retentionResult struct {
	Events, Deposits int64
}

// cleanupExpired removes only resolved custody. A late collection gets its own
// full retention period; belongings still held at the venue never expire here.
// cutoff is fixed for a pass, making the exact seven-day boundary testable.
func (h *Handler) cleanupExpired(ctx context.Context, cutoff time.Time) (retentionResult, error) {
	var result retentionResult
	for i := 0; i < retentionBatchEvents; i++ {
		deposits, found, err := h.cleanupEvent(ctx, cutoff)
		if err != nil {
			return result, err
		}
		if !found {
			break
		}
		result.Events++
		result.Deposits += deposits
	}
	return result, nil
}

func (h *Handler) cleanupEvent(ctx context.Context, cutoff time.Time) (int64, bool, error) {
	tx, err := h.Pool.Begin(ctx)
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback(ctx)

	// Use the same event lock as allocation, handover, configuration and event
	// deletion. Recheck eligibility while acquiring it; skip events in use.
	var event string
	err = tx.QueryRow(ctx, `SELECT e.id::text FROM events e
 WHERE e.end_time <= $1 AND (
   EXISTS(SELECT 1 FROM wardrobe_deposits d WHERE d.event_id=e.id
     AND (d.status IN ('returned','cancelled') OR d.status='reserved')
     AND coalesce(d.returned_at,d.reserved_until) <= $1)
   OR (NOT EXISTS(SELECT 1 FROM wardrobe_deposits d WHERE d.event_id=e.id)
     AND (EXISTS(SELECT 1 FROM wardrobe_zones z WHERE z.event_id=e.id)
       OR EXISTS(SELECT 1 FROM wardrobe_staff s WHERE s.event_id=e.id)
       OR EXISTS(SELECT 1 FROM wardrobe_audit a WHERE a.event_id=e.id)))
 ) ORDER BY e.end_time,e.id LIMIT 1 FOR UPDATE OF e SKIP LOCKED`, cutoff).Scan(&event)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	// A fresh statement after the lock also observes a rescheduled end time.
	var stillExpired bool
	if err = tx.QueryRow(ctx, `SELECT end_time <= $2 FROM events WHERE id=$1::uuid`, event, cutoff).Scan(&stillExpired); err != nil {
		return 0, false, err
	}
	if !stillExpired {
		return 0, true, nil
	}
	if err = expire(ctx, tx, event); err != nil {
		return 0, false, err
	}

	// Delete linked audit first to satisfy its RESTRICT FK. Both removals and
	// optional configuration cleanup commit together, never halfway through.
	_, err = tx.Exec(ctx, `DELETE FROM wardrobe_audit a USING wardrobe_deposits d
 WHERE a.deposit_id=d.id AND d.event_id=$1::uuid
 AND d.status IN ('returned','cancelled')
 AND coalesce(d.returned_at,d.reserved_until) <= $2`, event, cutoff)
	if err != nil {
		return 0, false, err
	}
	tag, err := tx.Exec(ctx, `DELETE FROM wardrobe_deposits
 WHERE event_id=$1::uuid AND status IN ('returned','cancelled')
 AND coalesce(returned_at,reserved_until) <= $2`, event, cutoff)
	if err != nil {
		return 0, false, err
	}
	var remaining bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wardrobe_deposits WHERE event_id=$1::uuid)`, event).Scan(&remaining); err != nil {
		return 0, false, err
	}
	if !remaining {
		// Staff access and the physical place map are still necessary while even
		// one item is unclaimed. Only remove them after the final record expires.
		for _, statement := range []string{
			`DELETE FROM wardrobe_audit WHERE event_id=$1::uuid`,
			`DELETE FROM wardrobe_staff WHERE event_id=$1::uuid`,
			`DELETE FROM wardrobe_zones WHERE event_id=$1::uuid`, // slots cascade
		} {
			if _, err = tx.Exec(ctx, statement, event); err != nil {
				return 0, false, err
			}
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, false, err
	}
	return tag.RowsAffected(), true, nil
}

func (h *Handler) StartCleanupWorker(ctx context.Context) {
	go func() {
		cleanup := func() {
			job, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()
			result, err := h.cleanupExpired(job, time.Now().UTC().Add(-retentionPeriod))
			if err != nil && ctx.Err() == nil {
				log.Print("wardrobe retention cleanup failed; retrying on next interval")
			} else if result.Events > 0 {
				log.Printf("wardrobe retention: cleaned %d events, %d resolved deposits", result.Events, result.Deposits)
			}
		}
		cleanup()
		timer := time.NewTicker(time.Hour)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				cleanup()
			}
		}
	}()
}
