package events

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"sort"
	"strings"

	db "pulse-api/db/generated"

	"github.com/jackc/pgx/v5/pgtype"
)

func saveEventLineup(ctx context.Context, queries *db.Queries, eventID, ownerID pgtype.UUID, lineup []ArtistInput, replace bool) error {
	// Image uploads share the event-banner registry. Claim them before changing
	// the lineup, inside the event transaction, so GC cannot delete an image as
	// it is being attached. NOWAIT avoids cross-event banner/lineup lock cycles.
	keys := map[string]bool{}
	for _, artist := range lineup {
		key, err := artistImageAssetKey(artist.ImageURL, ownerID.String())
		if err != nil {
			return err
		}
		if key != "" {
			keys[key] = true
		}
	}
	ordered := make([]string, 0, len(keys))
	for key := range keys {
		ordered = append(ordered, key)
	}
	sort.Strings(ordered)
	for _, key := range ordered {
		changed, err := queries.ClaimReadyEventArtistImageAsset(ctx, db.ClaimReadyEventArtistImageAssetParams{OwnerID: ownerID, S3Key: key})
		if err == nil && changed == 0 {
			// Before the media registry, existing lineup images had no asset row.
			// Only an already saved, owned artist reference can register one here;
			// this never resurrects pending/deleting assets or arbitrary new URLs.
			err = queries.RegisterReferencedArtistImageAsset(ctx, db.RegisterReferencedArtistImageAssetParams{OwnerID: ownerID, S3Key: key})
			if err == nil {
				changed, err = queries.ClaimReadyEventArtistImageAsset(ctx, db.ClaimReadyEventArtistImageAssetParams{OwnerID: ownerID, S3Key: key})
			}
		}
		if err != nil || changed != 1 {
			return fmt.Errorf("imaginea artistului nu mai este disponibila; reincarca imaginea si incearca din nou")
		}
	}
	if replace {
		if err := queries.DeleteEventArtists(ctx, eventID); err != nil {
			return err
		}
	}

	for index, artist := range lineup {
		name := strings.TrimSpace(artist.Name)
		if name == "" {
			return fmt.Errorf("numele artistului este obligatoriu")
		}

		source := strings.ToUpper(strings.TrimSpace(artist.Source))
		if source == "" {
			source = "MANUAL"
		}
		if source != "SPOTIFY" && source != "MANUAL" {
			return fmt.Errorf("sursa artistului este invalidă")
		}

		if err := queries.CreateEventArtist(ctx, db.CreateEventArtistParams{
			EventID:         eventID,
			Name:            name,
			ImageUrl:        optionalText(artist.ImageURL),
			Stage:           optionalText(artist.Stage),
			PerformanceTime: optionalText(artist.PerformanceTime),
			SpotifyUrl:      optionalText(artist.SpotifyURL),
			Source:          source,
			IsHeadliner:     artist.IsHeadliner,
			SortOrder:       int32(index),
		}); err != nil {
			return err
		}
	}

	return nil
}

func artistImageAssetKey(imageURL, ownerID string) (string, error) {
	imageURL = strings.TrimSpace(imageURL)
	if imageURL == "" {
		return "", nil
	}
	base, baseErr := url.Parse(strings.TrimRight(os.Getenv("PUBLIC_API_URL"), "/"))
	image, err := url.Parse(imageURL)
	if err != nil {
		return "", fmt.Errorf("imaginea artistului este invalida")
	}
	if baseErr != nil || base.Host == "" || image.Host != base.Host || image.Scheme != base.Scheme || !strings.HasPrefix(image.Path, strings.TrimRight(base.Path, "/")+"/api/v1/media/events/") {
		return "", nil // Spotify and existing external artist images are unchanged.
	}
	// Older public URLs can contain cache keys or percent-encoded filenames.
	image.RawQuery, image.Fragment, image.RawPath = "", "", ""
	key, ok := ownedEventBannerKey(image.String(), ownerID)
	if !ok {
		return "", fmt.Errorf("imaginea artistului nu apartine organizatorului")
	}
	return key, nil
}

func optionalText(value string) pgtype.Text {
	value = strings.TrimSpace(value)
	return pgtype.Text{String: value, Valid: value != ""}
}
