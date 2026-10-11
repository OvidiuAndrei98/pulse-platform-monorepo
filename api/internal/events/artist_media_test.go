package events

import (
	"context"
	"strings"
	"testing"

	db "pulse-api/db/generated"
)

func TestArtistImageAssetOwnership(t *testing.T) {
	t.Setenv("PUBLIC_API_URL", "https://api.spottr.test")
	const owner = "00000000-0000-4000-8000-000000000001"
	key := "events/" + owner + "/" + strings.Repeat("a", 32) + ".webp"
	for _, image := range []string{"", "https://i.scdn.co/image/spotify-image"} {
		got, err := artistImageAssetKey(image, owner)
		if err != nil || got != "" {
			t.Fatalf("external image changed: %q %v", got, err)
		}
	}
	got, err := artistImageAssetKey("https://api.spottr.test/api/v1/media/"+key, owner)
	if err != nil || got != key {
		t.Fatalf("owned image not claimed: %q %v", got, err)
	}
	got, err = artistImageAssetKey("https://api.spottr.test/api/v1/media/"+strings.Replace(key, "/aaaa", "/%61aaa", 1)+"?v=1#preview", owner)
	if err != nil || got != key {
		t.Fatalf("legacy image URL lost: %q %v", got, err)
	}
	if _, err := artistImageAssetKey("https://api.spottr.test/api/v1/media/"+strings.Replace(key, owner, "00000000-0000-4000-8000-000000000002", 1), owner); err == nil {
		t.Fatal("foreign registered image accepted")
	}
}

func TestArtistImageAttachmentProtectsAssetFromGC(t *testing.T) {
	pool := isolationTestPool(t)
	t.Setenv("PUBLIC_API_URL", "https://api.spottr.test")
	ctx := context.Background()
	owner := seedMediaOwner(t, pool)
	key := "events/" + owner.String() + "/" + strings.Repeat("b", 32) + ".webp"
	assetID := insertMediaAsset(t, pool, owner, key, "ready", true)
	eventID := insertMediaEvent(t, pool, owner, "")
	h := NewHandler(db.New(pool), pool)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if err := saveEventLineup(ctx, db.New(tx), eventID, owner, []ArtistInput{{Name: "Artist", ImageURL: "https://api.spottr.test/api/v1/media/" + key}}, false); err != nil {
		t.Fatal(err)
	}
	deleted := false
	deleteObject := func(_ context.Context, objectKey string) error {
		if objectKey == key {
			deleted = true
		}
		return nil
	}
	// The attachment transaction holds the asset lock; a competing GC worker skips it.
	if err := h.cleanupDueEventBanners(ctx, deleteObject); err != nil {
		t.Fatal(err)
	}
	if deleted {
		t.Fatal("image deleted while being attached")
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	// Legacy artist references must also protect an asset with an expired timer.
	if _, err := pool.Exec(ctx, "UPDATE event_banner_assets SET delete_after=clock_timestamp()-interval '1 hour' WHERE id=$1", assetID); err != nil {
		t.Fatal(err)
	}
	if err := h.cleanupDueEventBanners(ctx, deleteObject); err != nil {
		t.Fatal(err)
	}
	if deleted {
		t.Fatal("image deleted while referenced by an artist")
	}
	if err := db.New(pool).DeleteEventArtists(ctx, eventID); err != nil {
		t.Fatal(err)
	}
	if err := h.cleanupDueEventBanners(ctx, deleteObject); err != nil {
		t.Fatal(err)
	}
	if !deleted {
		t.Fatal("orphaned artist image no longer collected")
	}
}

func TestArtistImageCannotAttachAfterGCClaimsDeletion(t *testing.T) {
	pool := isolationTestPool(t)
	t.Setenv("PUBLIC_API_URL", "https://api.spottr.test")
	ctx := context.Background()
	owner := seedMediaOwner(t, pool)
	key := "events/" + owner.String() + "/" + strings.Repeat("c", 32) + ".webp"
	assetID := insertMediaAsset(t, pool, owner, key, "ready", true)
	eventID := insertMediaEvent(t, pool, owner, "")
	claimed, err := db.New(pool).ClaimDueEventBannerAssetDeletion(ctx)
	if err != nil || claimed.ID != assetID {
		t.Fatalf("expected asset to be claimed: %v", err)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if err := saveEventLineup(ctx, db.New(tx), eventID, owner, []ArtistInput{{Name: "Artist", ImageURL: "https://api.spottr.test/api/v1/media/" + key}}, false); err == nil {
		t.Fatal("attached image after GC claim")
	}
}

func TestExistingLegacyArtistImageRegistersBeforeEditing(t *testing.T) {
	pool := isolationTestPool(t)
	t.Setenv("PUBLIC_API_URL", "https://api.spottr.test")
	ctx := context.Background()
	owner := seedMediaOwner(t, pool)
	key := "events/" + owner.String() + "/" + strings.Repeat("d", 32) + ".webp"
	eventID := insertMediaEvent(t, pool, owner, "")
	imageURL := "https://api.spottr.test/api/v1/media/" + key
	if _, err := pool.Exec(ctx, "INSERT INTO event_artists(event_id,name,image_url,source,sort_order) VALUES($1,'Legacy artist',$2,'MANUAL',0)", eventID, imageURL); err != nil {
		t.Fatal(err)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if err := saveEventLineup(ctx, db.New(tx), eventID, owner, []ArtistInput{{Name: "Updated artist", ImageURL: imageURL}}, true); err != nil {
		t.Fatalf("legacy edit rejected: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := db.New(pool).FindReadyEventBannerAsset(ctx, db.FindReadyEventBannerAssetParams{OwnerID: owner, S3Key: key}); err != nil {
		t.Fatal("legacy image was not registered")
	}
}
