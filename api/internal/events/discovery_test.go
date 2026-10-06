package events

import (
	"strings"
	"testing"
)

func TestEventSearchPattern(t *testing.T) {
	for _, item := range []struct{ input, expected string }{
		{"", ""}, {"  ", ""}, {"  AFTER Dark  ", "%after dark%"},
		{"100%_club\\", `%100\%\_club\\%`}, {"Piața", "%piața%"},
		{strings.Repeat("ă", 120), "%" + strings.Repeat("ă", 120) + "%"},
	} {
		actual, err := eventSearchPattern(item.input)
		if err != nil || actual != item.expected {
			t.Errorf("%q: got %q, %v", item.input, actual, err)
		}
	}
	if _, err := eventSearchPattern(strings.Repeat("a", 121)); err == nil {
		t.Fatal("expected oversized query rejection")
	}
}

func TestEventPageOffset(t *testing.T) {
	for _, size := range []int32{20, 100} {
		for _, item := range []struct {
			page     string
			expected int32
		}{{"", 0}, {"1", 0}, {"2", size}, {"3", 2 * size}} {
			actual, err := eventPageOffset(item.page, size)
			if err != nil || actual != item.expected {
				t.Errorf("%q: got %d, %v", item.page, actual, err)
			}
		}
		for _, page := range []string{"0", "-1", "abc", "1.5", "2147483647", "99999999999999999999"} {
			if _, err := eventPageOffset(page, size); err == nil {
				t.Errorf("expected invalid/overflow page %q rejection", page)
			}
		}
	}
}
