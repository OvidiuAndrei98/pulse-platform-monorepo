package events

import (
	"encoding/json"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"
)

type TicketTypeResponse struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	PriceRon    int32     `json:"priceRon"`
	Capacity    int32     `json:"capacity"`
	StartSales  time.Time `json:"startSales"`
	EndSales    time.Time `json:"endSales"`
	Description string    `json:"description,omitempty"`
	TicketsSold *int32    `json:"ticketsSold,omitempty"`
}

type ArtistResponse struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	ImageURL        string `json:"imageUrl"`
	Stage           string `json:"stage,omitempty"`
	PerformanceTime string `json:"performanceTime,omitempty"`
	SpotifyURL      string `json:"spotifyUrl,omitempty"`
	IsHeadliner     bool   `json:"isHeadliner"`
	Source          string `json:"source"`
}

type EventStatsResponse struct {
	TotalCheckIns     int64  `json:"totalCheckIns"`
	UserHasCheckedIn  *bool  `json:"userHasCheckedIn,omitempty"`
	IsFavorited       *bool  `json:"isFavorited,omitempty"`
	TotalTicketsSold  *int64 `json:"totalTicketsSold,omitempty"`
	TotalRevenueRon   *int64 `json:"totalRevenueRon,omitempty"`
	InterestedCount   *int64 `json:"interestedCount,omitempty"`
	GoingCount        *int64 `json:"goingCount,omitempty"`
	TicketHolderCount *int64 `json:"ticketHolderCount,omitempty"`
}

type EventResponse struct {
	ID                         string               `json:"id"`
	OrganizerID                string               `json:"organizerId"`
	Title                      string               `json:"title"`
	Description                string               `json:"description,omitempty"`
	Category                   string               `json:"category"`
	Status                     string               `json:"status"`
	BannerUrl                  string               `json:"bannerUrl,omitempty"`
	GooglePlaceID              string               `json:"googlePlaceId"`
	LocationName               string               `json:"locationName"`
	City                       string               `json:"city"`
	Vibe                       string               `json:"vibe"`
	OrganizerAbsorbsServiceFee bool                 `json:"organizerAbsorbsServiceFee"`
	Latitude                   float64              `json:"latitude"`
	Longitude                  float64              `json:"longitude"`
	StartTime                  time.Time            `json:"startTime"`
	EndTime                    time.Time            `json:"endTime"`
	IsLive                     bool                 `json:"isLive"`
	CreatedAt                  time.Time            `json:"createdAt"`
	TicketTypes                []TicketTypeResponse `json:"ticketTypes"`
	Lineup                     []ArtistResponse     `json:"lineup"`
	Stats                      EventStatsResponse   `json:"stats"`
}

// Funcție ajutătoare universală cu logging detaliat pentru parsarea biletelor
func parseTicketTypesWithLogs(functionName string, rawField interface{}) []TicketTypeResponse {
	tickets := []TicketTypeResponse{}

	if rawField == nil {
		return tickets
	}

	intermedBytes, err := json.Marshal(rawField)
	if err != nil {
		return tickets
	}

	// Structură temporară locală pentru a prinde cheile din DB/JSON
	type dbTicketTypeAlias struct {
		ID          string    `json:"id"`
		Name        string    `json:"name"`
		PriceRon    int32     `json:"price_ron"`
		Capacity    int32     `json:"capacity"`
		StartSales  time.Time `json:"start_sales"`
		EndSales    time.Time `json:"end_sales"`
		Description string    `json:"description"`
		TicketsSold *int32    `json:"tickets_sold"`
	}

	var dbTickets []dbTicketTypeAlias
	if err := json.Unmarshal(intermedBytes, &dbTickets); err != nil {
		return tickets
	}

	// Mapezi în structura ta existentă `TicketTypeResponse`
	for _, t := range dbTickets {
		tickets = append(tickets, TicketTypeResponse{
			ID:          t.ID,
			Name:        t.Name,
			PriceRon:    t.PriceRon,
			Capacity:    t.Capacity,
			StartSales:  t.StartSales,
			EndSales:    t.EndSales,
			Description: t.Description,
			TicketsSold: t.TicketsSold,
		})
	}

	return tickets
}

func parseLineup(rawField interface{}) []ArtistResponse {
	lineup := []ArtistResponse{}
	if rawField == nil {
		return lineup
	}

	encoded, err := json.Marshal(rawField)
	if err != nil {
		return lineup
	}

	type dbArtist struct {
		ID              string  `json:"id"`
		Name            string  `json:"name"`
		ImageURL        string  `json:"image_url"`
		Stage           *string `json:"stage"`
		PerformanceTime *string `json:"performance_time"`
		SpotifyURL      *string `json:"spotify_url"`
		IsHeadliner     bool    `json:"is_headliner"`
		Source          string  `json:"source"`
	}

	var artists []dbArtist
	if err := json.Unmarshal(encoded, &artists); err != nil {
		return lineup
	}

	for _, artist := range artists {
		item := ArtistResponse{
			ID:          artist.ID,
			Name:        artist.Name,
			ImageURL:    artist.ImageURL,
			IsHeadliner: artist.IsHeadliner,
			Source:      artist.Source,
		}
		if artist.Stage != nil {
			item.Stage = *artist.Stage
		}
		if artist.PerformanceTime != nil {
			item.PerformanceTime = *artist.PerformanceTime
		}
		if artist.SpotifyURL != nil {
			item.SpotifyURL = *artist.SpotifyURL
		}
		lineup = append(lineup, item)
	}

	return lineup
}

// Mapare din ListEventsRow (Varianta Publică generală)
func MapFromDBListEvents(row db.ListEventsRow) EventResponse {
	tickets := parseTicketTypesWithLogs("MapFromDBListEvents", row.TicketTypes)
	lineup := parseLineup(row.Lineup)
	hasCheckedIn := row.UserHasCheckedIn
	isFavorited := row.IsFavorited

	return EventResponse{
		ID:                         common.UUIDToString(row.ID),
		OrganizerID:                common.UUIDToString(row.OrganizerID),
		Title:                      row.Title,
		Description:                row.Description.String,
		Category:                   row.Category,
		Status:                     row.Status,
		BannerUrl:                  row.BannerUrl.String,
		GooglePlaceID:              row.GooglePlaceID,
		LocationName:               row.LocationName,
		City:                       row.City,
		Vibe:                       row.Vibe,
		OrganizerAbsorbsServiceFee: row.OrganizerAbsorbsServiceFee,
		Latitude:                   row.Latitude,
		Longitude:                  row.Longitude,
		StartTime:                  row.StartTime.Time,
		EndTime:                    row.EndTime.Time,
		IsLive:                     common.PgBoolToBool(row.IsLive),
		CreatedAt:                  row.CreatedAt.Time,
		TicketTypes:                tickets,
		Lineup:                     lineup,
		Stats: EventStatsResponse{
			TotalCheckIns:    row.TotalCheckIns,
			UserHasCheckedIn: &hasCheckedIn,
			IsFavorited:      &isFavorited,
			TotalTicketsSold: nil,
			TotalRevenueRon:  nil,
		},
	}
}

// Mapare din ListEventsWithStatsRow (Varianta de Management/Dashboard)
func MapFromDBListEventsWithStats(row db.ListEventsWithStatsRow) EventResponse {
	tickets := parseTicketTypesWithLogs("MapFromDBListEventsWithStats", row.TicketTypes)
	lineup := parseLineup(row.Lineup)
	ticketsSold := row.TotalTicketsSold
	revenue := row.TotalRevenueRon
	interested := row.InterestedCount
	going := int64(row.GoingCount)
	ticketHolders := row.TicketHolderCount

	return EventResponse{
		ID:                         common.UUIDToString(row.ID),
		OrganizerID:                common.UUIDToString(row.OrganizerID),
		Title:                      row.Title,
		Description:                row.Description.String,
		Category:                   row.Category,
		Status:                     row.Status,
		BannerUrl:                  row.BannerUrl.String,
		GooglePlaceID:              row.GooglePlaceID,
		LocationName:               row.LocationName,
		City:                       row.City,
		Vibe:                       row.Vibe,
		OrganizerAbsorbsServiceFee: row.OrganizerAbsorbsServiceFee,
		Latitude:                   row.Latitude,
		Longitude:                  row.Longitude,
		StartTime:                  row.StartTime.Time,
		EndTime:                    row.EndTime.Time,
		IsLive:                     common.PgBoolToBool(row.IsLive),
		CreatedAt:                  row.CreatedAt.Time,
		TicketTypes:                tickets,
		Lineup:                     lineup,
		Stats: EventStatsResponse{
			TotalCheckIns:     row.TotalCheckIns,
			UserHasCheckedIn:  nil,
			IsFavorited:       nil,
			TotalTicketsSold:  &ticketsSold,
			TotalRevenueRon:   &revenue,
			InterestedCount:   &interested,
			GoingCount:        &going,
			TicketHolderCount: &ticketHolders,
		},
	}
}

// Mapare din GetEventByIDRow (Detalii Publice)
func MapFromDBGetEvent(row db.GetEventByIDRow) EventResponse {
	tickets := parseTicketTypesWithLogs("MapFromDBGetEvent", row.TicketTypes)
	lineup := parseLineup(row.Lineup)
	hasCheckedIn := row.UserHasCheckedIn
	isFavorited := row.IsFavorited

	return EventResponse{
		ID:                         common.UUIDToString(row.ID),
		OrganizerID:                common.UUIDToString(row.OrganizerID),
		Title:                      row.Title,
		Description:                row.Description.String,
		Category:                   row.Category,
		Status:                     row.Status,
		BannerUrl:                  row.BannerUrl.String,
		GooglePlaceID:              row.GooglePlaceID,
		LocationName:               row.LocationName,
		City:                       row.City,
		Vibe:                       row.Vibe,
		OrganizerAbsorbsServiceFee: row.OrganizerAbsorbsServiceFee,
		Latitude:                   row.Latitude,
		Longitude:                  row.Longitude,
		StartTime:                  row.StartTime.Time,
		EndTime:                    row.EndTime.Time,
		IsLive:                     common.PgBoolToBool(row.IsLive),
		CreatedAt:                  row.CreatedAt.Time,
		TicketTypes:                tickets,
		Lineup:                     lineup,
		Stats: EventStatsResponse{
			TotalCheckIns:    row.TotalCheckIns,
			UserHasCheckedIn: &hasCheckedIn,
			IsFavorited:      &isFavorited,
			TotalTicketsSold: nil,
			TotalRevenueRon:  nil,
		},
	}
}

// Mapare din GetEventWithStatsRow (Detalii Admin/Organizator)
func MapFromDBGetEventWithStats(row db.GetEventWithStatsRow) EventResponse {
	tickets := parseTicketTypesWithLogs("MapFromDBGetEventWithStats", row.TicketTypes)
	lineup := parseLineup(row.Lineup)
	ticketsSold := row.TotalTicketsSold
	revenue := row.TotalRevenueRon
	interested := row.InterestedCount
	going := int64(row.GoingCount)
	ticketHolders := row.TicketHolderCount

	return EventResponse{
		ID:                         common.UUIDToString(row.ID),
		OrganizerID:                common.UUIDToString(row.OrganizerID),
		Title:                      row.Title,
		Description:                row.Description.String,
		Category:                   row.Category,
		Status:                     row.Status,
		BannerUrl:                  row.BannerUrl.String,
		GooglePlaceID:              row.GooglePlaceID,
		LocationName:               row.LocationName,
		City:                       row.City,
		Vibe:                       row.Vibe,
		OrganizerAbsorbsServiceFee: row.OrganizerAbsorbsServiceFee,
		Latitude:                   row.Latitude,
		Longitude:                  row.Longitude,
		StartTime:                  row.StartTime.Time,
		EndTime:                    row.EndTime.Time,
		IsLive:                     common.PgBoolToBool(row.IsLive),
		CreatedAt:                  row.CreatedAt.Time,
		TicketTypes:                tickets,
		Lineup:                     lineup,
		Stats: EventStatsResponse{
			TotalCheckIns:     row.TotalCheckIns,
			UserHasCheckedIn:  nil,
			IsFavorited:       nil,
			TotalTicketsSold:  &ticketsSold,
			TotalRevenueRon:   &revenue,
			InterestedCount:   &interested,
			GoingCount:        &going,
			TicketHolderCount: &ticketHolders,
		},
	}
}
