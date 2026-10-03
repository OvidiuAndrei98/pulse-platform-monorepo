package tickets

import "time"

func validOfflineScanTime(value string, generatedAt, expiresAt, now time.Time) bool {
	scannedAt, err := time.Parse(time.RFC3339, value)
	if err != nil || !expiresAt.After(generatedAt) {
		return false
	}
	// Small device clock skew is allowed at download, never past expiration.
	return !scannedAt.Before(generatedAt.Add(-2*time.Minute)) &&
		scannedAt.Before(expiresAt) && !scannedAt.After(now.Add(2*time.Minute))
}
