package common

import "net/url"

func ValidOrganizerClient(client string) bool {
	return client == "" || client == "native" || client == "native-preview"
}

// Only fixed, first-party bridges are allowed. No caller-supplied redirect URL.
func OrganizerReturnURL(appURL, client, flow, status, campaignID string) string {
	if client != "native" && client != "native-preview" {
		if flow == "connect" {
			return appURL + "/dashboard?stripe=" + url.QueryEscape(status)
		}
		payment := "success"
		if status == "cancelled" {
			payment = "cancelled"
		}
		return appURL + "/dashboard/promotions?payment=" + payment
	}
	params := url.Values{"flow": {flow}, "status": {status}}
	if flow == "promotion" {
		params.Set("campaignId", campaignID)
	}
	if client == "native-preview" {
		params.Set("client", "preview")
	}
	return appURL + "/organizers/native-return?" + params.Encode()
}
