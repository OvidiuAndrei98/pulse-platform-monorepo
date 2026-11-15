package common

import (
	"errors"
	"strings"
	"time"
	_ "time/tzdata"

	"golang.org/x/text/unicode/norm"
)

var BucharestZone = func() *time.Location {
	zone, err := time.LoadLocation("Europe/Bucharest")
	if err != nil {
		panic("embedded Europe/Bucharest timezone unavailable")
	}
	return zone
}()

// City keys identify the supported product labels, never display spelling.
func CityKey(value string) string {
	value = norm.NFC.String(strings.ToLower(strings.TrimSpace(value)))
	return strings.NewReplacer("ă", "a", "â", "a", "î", "i", "ș", "s", "ş", "s", "ț", "t", "ţ", "t").Replace(value)
}
func CanonicalPlanningCity(value string) string {
	key := CityKey(value)
	for _, city := range []string{"Bucuresti", "Cluj-Napoca", "Timisoara", "Iasi", "Brasov", "Constanta", "Sibiu"} {
		if CityKey(city) == key {
			return city
		}
	}
	return ""
}

// Construct both calendar-local endpoints independently. DST makes their UTC
// distance 23 or 25 hours on transition nights.
func NightBounds(day string) (time.Time, time.Time, error) {
	date, err := time.ParseInLocation("2006-01-02", day, BucharestZone)
	if err != nil || date.Format("2006-01-02") != day {
		return time.Time{}, time.Time{}, errors.New("invalid night date")
	}
	start := time.Date(date.Year(), date.Month(), date.Day(), 6, 0, 0, 0, BucharestZone)
	next := date.AddDate(0, 0, 1)
	end := time.Date(next.Year(), next.Month(), next.Day(), 6, 0, 0, 0, BucharestZone)
	return start, end, nil
}
