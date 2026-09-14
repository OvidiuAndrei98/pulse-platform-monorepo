package events

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	db "pulse-api/db/generated"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

func seedMediaOwner(t *testing.T, pool *pgxpool.Pool) pgtype.UUID {
	t.Helper()
	var ownerID pgtype.UUID
	suffix := time.Now().UnixNano()
	if err := pool.QueryRow(context.Background(), `
		INSERT INTO users (username,email,password_hash,role,is_active)
		VALUES ($1,$2,'not-used','organizer',TRUE) RETURNING id`,
		fmt.Sprintf("media-owner-%d", suffix), fmt.Sprintf("media-owner-%d@example.invalid", suffix)).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx := context.Background()
		if _, err := pool.Exec(ctx, "DELETE FROM events WHERE organizer_id=$1", ownerID); err != nil {
			t.Error(err)
		}
		if _, err := pool.Exec(ctx, "DELETE FROM event_banner_assets WHERE owner_id=$1", ownerID); err != nil {
			t.Error(err)
		}
		if _, err := pool.Exec(ctx, "DELETE FROM users WHERE id=$1", ownerID); err != nil {
			t.Error(err)
		}
	})
	return ownerID
}

func insertMediaAsset(t *testing.T, pool *pgxpool.Pool, ownerID pgtype.UUID, key, status string, due bool) pgtype.UUID {
	t.Helper()
	var assetID pgtype.UUID
	deleteAfter := time.Now().Add(72 * time.Hour)
	if due {
		deleteAfter = time.Now().Add(-time.Hour)
	}
	if err := pool.QueryRow(context.Background(), `
		INSERT INTO event_banner_assets (owner_id,s3_key,status,delete_after)
		VALUES ($1,$2,$3,$4) RETURNING id`, ownerID, key, status, deleteAfter).Scan(&assetID); err != nil {
		t.Fatal(err)
	}
	return assetID
}

func insertMediaEvent(t *testing.T, pool *pgxpool.Pool, ownerID pgtype.UUID, bannerURL string) pgtype.UUID {
	t.Helper()
	var eventID pgtype.UUID
	if err := pool.QueryRow(context.Background(), `
		INSERT INTO events (organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status,banner_url)
		VALUES ($1,'Media security','house','Venue','Bucuresti','social',44,26,clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days','place','draft',NULLIF($2,''))
		RETURNING id`, ownerID, bannerURL).Scan(&eventID); err != nil {
		t.Fatal(err)
	}
	return eventID
}

func assertAssetMissing(t *testing.T, pool *pgxpool.Pool, assetID pgtype.UUID) {
	t.Helper()
	var exists bool
	if err := pool.QueryRow(context.Background(), "SELECT EXISTS(SELECT 1 FROM event_banner_assets WHERE id=$1)", assetID).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists {
		t.Fatal("asset should have been deleted")
	}
}

func TestBannerGCProtectsRegisteredSharedAndLegacyReferences(t *testing.T) {
	pool := isolationTestPool(t)
	ownerID := seedMediaOwner(t, pool)
	handler := NewHandler(db.New(pool), pool)
	ctx := context.Background()
	key := "events/" + ownerID.String() + "/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg"
	url := "https://api.spottr.test/api/v1/media/" + key
	legacyEncodedURL := "https://api.spottr.test/api/v1/media/events/" + ownerID.String() + "/%61aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg?v=1#preview"
	assetID := insertMediaAsset(t, pool, ownerID, key, "ready", true)
	eventOne := insertMediaEvent(t, pool, ownerID, url)
	eventTwo := insertMediaEvent(t, pool, ownerID, legacyEncodedURL)
	for _, eventID := range []pgtype.UUID{eventOne, eventTwo} {
		if _, err := pool.Exec(ctx, "INSERT INTO event_banner_references(event_id,asset_id) VALUES ($1,$2)", eventID, assetID); err != nil {
			t.Fatal(err)
		}
	}
	deleted := 0
	deleteObject := func(context.Context, string) error { deleted++; return nil }
	if err := handler.cleanupDueEventBanners(ctx, deleteObject); err != nil || deleted != 0 {
		t.Fatalf("shared referenced asset was selected: deletes=%d err=%v", deleted, err)
	}
	if _, err := pool.Exec(ctx, "UPDATE events SET banner_url=NULL WHERE id=$1", eventOne); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "DELETE FROM event_banner_references WHERE event_id=$1", eventOne); err != nil {
		t.Fatal(err)
	}
	if err := handler.cleanupDueEventBanners(ctx, deleteObject); err != nil || deleted != 0 {
		t.Fatalf("asset with one remaining reference was selected: deletes=%d err=%v", deleted, err)
	}
	// Remove the registry reference but leave the legacy URL. The legacy guard
	// must still prevent deletion during and after mixed-version rollout.
	if _, err := pool.Exec(ctx, "DELETE FROM event_banner_references WHERE event_id=$1", eventTwo); err != nil {
		t.Fatal(err)
	}
	if err := handler.cleanupDueEventBanners(ctx, deleteObject); err != nil || deleted != 0 {
		t.Fatalf("legacy URL reference was selected: deletes=%d err=%v", deleted, err)
	}
	if _, err := pool.Exec(ctx, "UPDATE events SET banner_url=NULL WHERE id=$1", eventTwo); err != nil {
		t.Fatal(err)
	}
	if err := handler.cleanupDueEventBanners(ctx, deleteObject); err != nil || deleted != 1 {
		t.Fatalf("unreferenced asset was not deleted: deletes=%d err=%v", deleted, err)
	}
	assertAssetMissing(t, pool, assetID)
}

func TestBannerRegistryReconcilesMixedVersionWrites(t *testing.T) {
	pool := isolationTestPool(t)
	ownerID := seedMediaOwner(t, pool)
	ctx := context.Background()
	queries := db.New(pool)
	keyOne := "events/" + ownerID.String() + "/12121212121212121212121212121212.jpg"
	keyTwo := "events/" + ownerID.String() + "/34343434343434343434343434343434.webp"
	eventID := insertMediaEvent(t, pool, ownerID, "https://api.spottr.test/api/v1/media/"+keyOne)
	if err := queries.ReconcileLegacyEventBannerReferences(ctx); err != nil {
		t.Fatal(err)
	}
	var firstAssetID pgtype.UUID
	if err := pool.QueryRow(ctx, `SELECT asset_id FROM event_banner_references WHERE event_id=$1`, eventID).Scan(&firstAssetID); err != nil {
		t.Fatal(err)
	}
	secondAssetID := insertMediaAsset(t, pool, ownerID, keyTwo, "ready", true)
	// Simulate an old task replacing the URL without touching the registry.
	filenameTwo := strings.TrimPrefix(keyTwo, "events/"+ownerID.String()+"/")
	encodedSecondURL := "https://api.spottr.test/api/v1/media/events/" + ownerID.String() + "/%33" + filenameTwo[1:] + "?legacy=1#preview"
	if _, err := pool.Exec(ctx, "UPDATE events SET banner_url=$2 WHERE id=$1", eventID, encodedSecondURL); err != nil {
		t.Fatal(err)
	}
	if err := queries.ReconcileLegacyEventBannerReferences(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := queries.ScheduleAllUnreferencedEventBannerAssets(ctx); err != nil {
		t.Fatal(err)
	}
	var referencedKey string
	var activeDeleteAfter *time.Time
	if err := pool.QueryRow(ctx, `
		SELECT asset.s3_key, asset.delete_after
		FROM event_banner_references reference
		JOIN event_banner_assets asset ON asset.id=reference.asset_id
		WHERE reference.event_id=$1`, eventID).Scan(&referencedKey, &activeDeleteAfter); err != nil {
		t.Fatal(err)
	}
	var oldDeleteAfter *time.Time
	if err := pool.QueryRow(ctx, "SELECT delete_after FROM event_banner_assets WHERE id=$1", firstAssetID).Scan(&oldDeleteAfter); err != nil {
		t.Fatal(err)
	}
	if referencedKey != keyTwo || activeDeleteAfter != nil || oldDeleteAfter == nil {
		t.Fatalf("mixed-version reconciliation failed: key=%q activeDeleteAfter=%v oldDeleteAfter=%v", referencedKey, activeDeleteAfter, oldDeleteAfter)
	}

	// An old task can also clear the banner without touching the registry.
	if _, err := pool.Exec(ctx, "UPDATE events SET banner_url=NULL WHERE id=$1", eventID); err != nil {
		t.Fatal(err)
	}
	if _, err := queries.RemoveStaleEventBannerReferences(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := queries.ScheduleAllUnreferencedEventBannerAssets(ctx); err != nil {
		t.Fatal(err)
	}
	var references int
	var detachedDeleteAfter time.Time
	if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM event_banner_references WHERE event_id=$1), delete_after FROM event_banner_assets WHERE id=$2`, eventID, secondAssetID).Scan(&references, &detachedDeleteAfter); err != nil {
		t.Fatal(err)
	}
	remaining := time.Until(detachedDeleteAfter)
	if references != 0 || remaining < 71*time.Hour || remaining > 73*time.Hour {
		t.Fatalf("legacy clear left stale reference or wrong grace: refs=%d remaining=%v", references, remaining)
	}
}

func TestBannerRegistryIgnoresNULAndMalformedEscapes(t *testing.T) {
	pool := isolationTestPool(t)
	ownerID := seedMediaOwner(t, pool)
	ctx := context.Background()
	queries := db.New(pool)
	malformedURL := "https://api.spottr.test/api/v1/media/events/" + ownerID.String() + "/%00%GG.jpg"
	eventID := insertMediaEvent(t, pool, ownerID, malformedURL)
	if _, err := queries.RemoveStaleEventBannerReferences(ctx); err != nil {
		t.Fatal(err)
	}
	if err := queries.ReconcileLegacyEventBannerReferences(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := queries.ScheduleAllUnreferencedEventBannerAssets(ctx); err != nil {
		t.Fatal(err)
	}
	var references int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM event_banner_references WHERE event_id=$1", eventID).Scan(&references); err != nil {
		t.Fatal(err)
	}
	if references != 0 {
		t.Fatal("malformed legacy URL must not be registered")
	}
}

func TestBannerGCRetriesFailuresAndExpiredLeases(t *testing.T) {
	pool := isolationTestPool(t)
	ownerID := seedMediaOwner(t, pool)
	handler := NewHandler(db.New(pool), pool)
	ctx := context.Background()
	key := "events/" + ownerID.String() + "/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp"
	assetID := insertMediaAsset(t, pool, ownerID, key, "ready", true)
	if err := handler.cleanupDueEventBanners(ctx, func(context.Context, string) error { return errors.New("s3 unavailable") }); err != nil {
		t.Fatal(err)
	}
	var status string
	var attempts int
	var lastError string
	if err := pool.QueryRow(ctx, "SELECT status,delete_attempts,last_error FROM event_banner_assets WHERE id=$1", assetID).Scan(&status, &attempts, &lastError); err != nil {
		t.Fatal(err)
	}
	if status != "deleting" || attempts != 1 || lastError != "object deletion failed" {
		t.Fatalf("unexpected retry state: %s attempts=%d error=%q", status, attempts, lastError)
	}
	if _, err := pool.Exec(ctx, "UPDATE event_banner_assets SET deletion_lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", assetID); err != nil {
		t.Fatal(err)
	}
	deleted := 0
	if err := handler.cleanupDueEventBanners(ctx, func(context.Context, string) error { deleted++; return nil }); err != nil || deleted != 1 {
		t.Fatalf("expired lease was not retried: deletes=%d err=%v", deleted, err)
	}
	assertAssetMissing(t, pool, assetID)
}

func TestBannerGCRecoversAfterDeleteSucceededBeforeFinalize(t *testing.T) {
	pool := isolationTestPool(t)
	ownerID := seedMediaOwner(t, pool)
	handler := NewHandler(db.New(pool), pool)
	ctx := context.Background()
	key := "events/" + ownerID.String() + "/abababababababababababababababab.jpg"
	assetID := insertMediaAsset(t, pool, ownerID, key, "ready", true)
	claimed, err := handler.Queries.ClaimDueEventBannerAssetDeletion(ctx)
	if err != nil {
		t.Fatal(err)
	}
	// Simulate DeleteObject succeeding and the task crashing before the fenced
	// database finalize. An idempotent retry must finish after the lease expires.
	if _, err := pool.Exec(ctx, "UPDATE event_banner_assets SET deletion_lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", claimed.ID); err != nil {
		t.Fatal(err)
	}
	deleted := 0
	if err := handler.cleanupDueEventBanners(ctx, func(context.Context, string) error { deleted++; return nil }); err != nil || deleted != 1 {
		t.Fatalf("crashed delete was not retried: deletes=%d err=%v", deleted, err)
	}
	assertAssetMissing(t, pool, assetID)
}

func TestBannerDetachSchedulesGraceTransactionally(t *testing.T) {
	pool := isolationTestPool(t)
	t.Setenv("PUBLIC_API_URL", "https://api.spottr.test")
	ownerID := seedMediaOwner(t, pool)
	ctx := context.Background()
	key := "events/" + ownerID.String() + "/acacacacacacacacacacacacacacacac.jpg"
	url := "https://api.spottr.test/api/v1/media/" + key
	assetID := insertMediaAsset(t, pool, ownerID, key, "ready", false)
	if _, err := pool.Exec(ctx, "UPDATE event_banner_assets SET delete_after=NULL WHERE id=$1", assetID); err != nil {
		t.Fatal(err)
	}
	eventID := insertMediaEvent(t, pool, ownerID, url)
	if _, err := pool.Exec(ctx, "INSERT INTO event_banner_references(event_id,asset_id) VALUES ($1,$2)", eventID, assetID); err != nil {
		t.Fatal(err)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	qtx := db.New(pool).WithTx(tx)
	if _, err := qtx.LockOwnedEventForBannerChange(ctx, db.LockOwnedEventForBannerChangeParams{ID: eventID, OrganizerID: ownerID}); err != nil {
		t.Fatal(err)
	}
	current, err := currentEventBannerAsset(ctx, qtx, eventID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := claimEventBannerAsset(ctx, qtx, ownerID, current, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "UPDATE events SET banner_url=NULL WHERE id=$1", eventID); err != nil {
		t.Fatal(err)
	}
	if err := applyEventBannerReference(ctx, qtx, eventID, current, pgtype.UUID{}); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	var deleteAfter time.Time
	var references int
	if err := pool.QueryRow(ctx, `SELECT delete_after, (SELECT count(*) FROM event_banner_references WHERE event_id=$1) FROM event_banner_assets WHERE id=$2`, eventID, assetID).Scan(&deleteAfter, &references); err != nil {
		t.Fatal(err)
	}
	remaining := time.Until(deleteAfter)
	if references != 0 || remaining < 71*time.Hour || remaining > 73*time.Hour {
		t.Fatalf("detach did not schedule the 72h grace: refs=%d remaining=%v", references, remaining)
	}
}

func TestBannerGCPendingUploadSafetyAndConcurrentClaims(t *testing.T) {
	pool := isolationTestPool(t)
	ownerID := seedMediaOwner(t, pool)
	handler := NewHandler(db.New(pool), pool)
	ctx := context.Background()
	recentKey := "events/" + ownerID.String() + "/cccccccccccccccccccccccccccccccc.png"
	oldKey := "events/" + ownerID.String() + "/dddddddddddddddddddddddddddddddd.png"
	recentID := insertMediaAsset(t, pool, ownerID, recentKey, "pending_upload", false)
	oldID := insertMediaAsset(t, pool, ownerID, oldKey, "pending_upload", false)
	if _, err := pool.Exec(ctx, "UPDATE event_banner_assets SET created_at=clock_timestamp()-interval '25 hours' WHERE id=$1", oldID); err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	deletes := map[string]int{}
	deleteObject := func(_ context.Context, key string) error {
		mu.Lock()
		deletes[key]++
		mu.Unlock()
		return nil
	}
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := handler.cleanupDueEventBanners(ctx, deleteObject); err != nil {
				t.Errorf("worker failed: %v", err)
			}
		}()
	}
	wg.Wait()
	if deletes[oldKey] != 1 || deletes[recentKey] != 0 {
		t.Fatalf("unexpected concurrent deletion counts: %#v", deletes)
	}
	assertAssetMissing(t, pool, oldID)
	var recentExists bool
	if err := pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM event_banner_assets WHERE id=$1)", recentID).Scan(&recentExists); err != nil || !recentExists {
		t.Fatal("recent pending upload must remain", err)
	}
}

func TestBannerAttachClaimIsAtomicForeignSafeAndRollbackSafe(t *testing.T) {
	pool := isolationTestPool(t)
	t.Setenv("PUBLIC_API_URL", "https://api.spottr.test")
	ownerID := seedMediaOwner(t, pool)
	otherOwnerID := seedMediaOwner(t, pool)
	ctx := context.Background()
	key := "events/" + ownerID.String() + "/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.jpg"
	url := "https://api.spottr.test/api/v1/media/" + key
	assetID := insertMediaAsset(t, pool, ownerID, key, "ready", true)
	eventID := insertMediaEvent(t, pool, ownerID, "")

	foreignTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	_, err = claimEventBannerAsset(ctx, db.New(pool).WithTx(foreignTx), otherOwnerID, pgtype.UUID{}, url)
	_ = foreignTx.Rollback(ctx)
	if !errors.Is(err, errEventBannerAssetUnavailable) {
		t.Fatalf("foreign owner claim returned %v", err)
	}

	rollbackTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	rollbackQueries := db.New(pool).WithTx(rollbackTx)
	claimed, err := claimEventBannerAsset(ctx, rollbackQueries, ownerID, pgtype.UUID{}, url)
	if err != nil {
		t.Fatal(err)
	}
	if err := applyEventBannerReference(ctx, rollbackQueries, eventID, pgtype.UUID{}, claimed); err != nil {
		t.Fatal(err)
	}
	if err := rollbackTx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	var referenceCount int
	var deleteAfter *time.Time
	if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM event_banner_references WHERE event_id=$1), delete_after FROM event_banner_assets WHERE id=$2`, eventID, assetID).Scan(&referenceCount, &deleteAfter); err != nil {
		t.Fatal(err)
	}
	if referenceCount != 0 || deleteAfter == nil {
		t.Fatal("rolled-back attachment changed durable registry state")
	}

	lockTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	lockedQueries := db.New(pool).WithTx(lockTx)
	if _, err := lockedQueries.LockEventBannerAssetPair(ctx, db.LockEventBannerAssetPairParams{ID: assetID, ID_2: assetID}); err != nil {
		t.Fatal(err)
	}
	claimDone := make(chan error, 1)
	go func() {
		_, claimErr := db.New(pool).ClaimDueEventBannerAssetDeletion(ctx)
		claimDone <- claimErr
	}()
	if err := <-claimDone; !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("GC should skip locked asset, got %v", err)
	}
	claimed, err = claimEventBannerAsset(ctx, lockedQueries, ownerID, pgtype.UUID{}, url)
	if err != nil {
		t.Fatal(err)
	}
	if err := applyEventBannerReference(ctx, lockedQueries, eventID, pgtype.UUID{}, claimed); err != nil {
		t.Fatal(err)
	}
	if err := lockTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
}
