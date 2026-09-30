package events

type TicketTypeInput struct {
	Name        string `json:"name"`
	PriceRon    int32  `json:"priceRon"`
	Capacity    int32  `json:"capacity"`
	StartSales  string `json:"startSales"`
	EndSales    string `json:"endSales"`
	Description string `json:"description"`
}

type ArtistInput struct {
	Name            string `json:"name"`
	ImageURL        string `json:"imageUrl"`
	Stage           string `json:"stage"`
	PerformanceTime string `json:"performanceTime"`
	SpotifyURL      string `json:"spotifyUrl"`
	IsHeadliner     bool   `json:"isHeadliner"`
	Source          string `json:"source"`
}

type CreateEventRequest struct {
	VATPercentage              *float64          `json:"vatPercentage"`
	Title                      string            `json:"title"`
	Description                string            `json:"description"`
	Category                   string            `json:"category"`
	BannerUrl                  string            `json:"bannerUrl"`
	GooglePlaceId              string            `json:"googlePlaceId"`
	LocationName               string            `json:"locationName"`
	City                       string            `json:"city"`
	Vibe                       string            `json:"vibe"`
	OrganizerAbsorbsServiceFee bool              `json:"organizerAbsorbsServiceFee"`
	Latitude                   float64           `json:"latitude"`
	Longitude                  float64           `json:"longitude"`
	StartTime                  string            `json:"startTime"`
	EndTime                    string            `json:"endTime"`
	Status                     string            `json:"status"`
	PublishAt                  *string           `json:"publishAt,omitempty"`
	TicketTypes                []TicketTypeInput `json:"ticketTypes"`
	Lineup                     []ArtistInput     `json:"lineup"`
}

type EditTicketTypeInput struct {
	ID          *string `json:"id,omitempty"`
	Name        string  `json:"name"`
	PriceRon    int32   `json:"priceRon"`
	Capacity    int32   `json:"capacity"`
	Description string  `json:"description"`
	StartSales  string  `json:"startSales"`
	EndSales    string  `json:"endSales"`
}

type EditEventRequest struct {
	VATPercentage              *float64              `json:"vatPercentage"`
	Title                      string                `json:"title"`
	Category                   string                `json:"category"`
	StartTime                  string                `json:"startTime"`
	EndTime                    string                `json:"endTime"`
	LocationName               string                `json:"locationName"`
	City                       string                `json:"city"`
	Vibe                       string                `json:"vibe"`
	OrganizerAbsorbsServiceFee bool                  `json:"organizerAbsorbsServiceFee"`
	Latitude                   float64               `json:"latitude"`
	Longitude                  float64               `json:"longitude"`
	GooglePlaceID              string                `json:"googlePlaceId"`
	Description                string                `json:"description"`
	Status                     string                `json:"status"`
	PublishAt                  *string               `json:"publishAt,omitempty"`
	BannerURL                  *string               `json:"bannerUrl,omitempty"`
	TicketTypes                []EditTicketTypeInput `json:"ticketTypes"`
	Lineup                     *[]ArtistInput        `json:"lineup"`
}
