package events

import (
	"context"
	"fmt"
	"strings"

	db "pulse-api/db/generated"

	"github.com/jackc/pgx/v5/pgtype"
)

func saveEventLineup(ctx context.Context, queries *db.Queries, eventID pgtype.UUID, lineup []ArtistInput, replace bool) error {
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

func optionalText(value string) pgtype.Text {
	value = strings.TrimSpace(value)
	return pgtype.Text{String: value, Valid: value != ""}
}
