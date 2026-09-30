package events

import (
	"errors"
	"strconv"

	"pulse-api/internal/common"

	"github.com/jackc/pgx/v5/pgtype"
)

func eventVAT(value *float64) (pgtype.Numeric, error) {
	if value == nil || !common.SupportedEventVATRate(*value) {
		return pgtype.Numeric{}, errors.New("Selecteaza TVA-ul evenimentului: 21%, 11% sau fara TVA (0)")
	}
	var result pgtype.Numeric
	err := result.Scan(strconv.FormatFloat(*value, 'f', 2, 64))
	return result, err
}

func vatResponse(value pgtype.Numeric) *float64 {
	parsed, err := value.Float64Value()
	if err != nil || !parsed.Valid {
		return nil
	}
	return &parsed.Float64
}
