package events

import (
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Treat user input literally: '%' and '_' must not become SQL wildcards.
func eventSearchPattern(query string) (string, error) {
	query = strings.TrimSpace(query)
	if utf8.RuneCountInString(query) > 120 {
		return "", fmt.Errorf("search query is too long")
	}
	if query == "" {
		return "", nil
	}
	escaped := strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(strings.ToLower(query))
	return "%" + escaped + "%", nil
}

func eventPageOffset(value string, pageSize int32) (int32, error) {
	if value == "" {
		return 0, nil
	}
	page, err := strconv.ParseInt(value, 10, 32)
	if err != nil || page < 1 || page > 1+2147483647/int64(pageSize) {
		return 0, fmt.Errorf("invalid page")
	}
	return int32((page - 1) * int64(pageSize)), nil
}
