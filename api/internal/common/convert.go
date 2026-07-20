package common

import (
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// UUIDToString convertește pgtype.UUID în string formatat standard.
func UUIDToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	b := u.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// TimestampToString convertește pgtype.Timestamptz în string RFC3339.
func TimestampToString(t pgtype.Timestamptz) string {
	if !t.Valid {
		return ""
	}
	return t.Time.UTC().Format(time.RFC3339)
}

func PgBoolToBool(pb pgtype.Bool) bool {
	if !pb.Valid {
		return false
	}
	return pb.Bool
}
