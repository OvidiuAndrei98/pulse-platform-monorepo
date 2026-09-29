package email

import (
	_ "embed"
	"encoding/json"
	"html"
	"regexp"
	"time"
	_ "time/tzdata"
)

// Shared verbatim with the web app and its printable PDF ticket.
//
//go:embed ticket-design.json
var ticketDesignJSON []byte

var ticketTemplate = func() string {
	var design struct {
		Template string `json:"template"`
	}
	if err := json.Unmarshal(ticketDesignJSON, &design); err != nil {
		panic(err)
	}
	return design.Template
}()
var ticketToken = regexp.MustCompile(`\{\{(\w+)\}\}`)
var ticketTimezone = func() *time.Location {
	zone, err := time.LoadLocation("Europe/Bucharest")
	if err != nil {
		panic(err)
	}
	return zone
}()

func renderTicketCard(ticket TicketDelivery, eventTitle, locationName, contentID string) string {
	date := "Data indisponibila"
	if !ticket.StartTime.IsZero() {
		date = ticket.StartTime.In(ticketTimezone).Format("02.01.2006 · 15:04")
	}
	values := map[string]string{
		"type": ticket.TicketTypeName, "title": eventTitle,
		"dateLabel": "Data si ora", "date": date,
		"locationLabel": "Locatie", "location": locationName,
		"qr": "cid:" + contentID, "qrLabel": "Cod QR bilet",
		"codeLabel": "Cod bilet", "id": ticket.ID,
		"hint": "Prezinta acest cod QR la intrare. Fiecare cod poate fi validat o singura data.",
	}
	return ticketToken.ReplaceAllStringFunc(ticketTemplate, func(token string) string {
		return html.EscapeString(values[token[2:len(token)-2]])
	})
}
