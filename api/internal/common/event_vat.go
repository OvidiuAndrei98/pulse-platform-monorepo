package common

// SupportedEventVATRate restricts new event sales, not historical order snapshots.
// Zero represents no VAT collected, rather than a taxable zero-rate treatment.
func SupportedEventVATRate(value float64) bool {
	return value == 0 || value == 11 || value == 21
}
