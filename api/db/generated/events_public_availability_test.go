package db

import (
	"strings"
	"testing"
)

func TestPublicEventQueriesIncludeReservedTicketCount(t *testing.T) {
	t.Parallel()

	for name, query := range map[string]string{
		"event list":   listEvents,
		"event detail": getEventByID,
	} {
		query := query
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if !strings.Contains(query, "'tickets_sold', tt.tickets_sold") {
				t.Fatal("public event response omits reserved ticket capacity")
			}
		})
	}
}
