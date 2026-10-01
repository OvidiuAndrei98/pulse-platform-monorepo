package events

import (
	"errors"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
)

func externalTicketURL(raw string) (pgtype.Text, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return pgtype.Text{}, nil
	}
	if len(raw) > 2048 {
		return pgtype.Text{}, errors.New("Linkul extern pentru bilete este prea lung")
	}
	parsed, err := url.ParseRequestURI(raw)
	if err != nil || !strings.EqualFold(parsed.Scheme, "https") || parsed.Host == "" || parsed.Hostname() == "" || parsed.User != nil {
		return pgtype.Text{}, errors.New("Linkul extern pentru bilete trebuie sa fie un URL HTTPS valid")
	}
	return pgtype.Text{String: parsed.String(), Valid: true}, nil
}
