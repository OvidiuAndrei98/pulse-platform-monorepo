package payments

import "net/url"

const checkoutClientNative = "native"

// The client chooses between two fixed app routes, never an arbitrary return URL.
func (h *CheckoutHandler) checkoutSuccessURL(client, eventID, sessionID string) string {
	path := "/checkout/success"
	if client == checkoutClientNative {
		path = "/checkout/native-return"
	}
	encodedSession := url.QueryEscape(sessionID)
	if sessionID == "{CHECKOUT_SESSION_ID}" {
		// Stripe replaces this literal placeholder after creating the Session.
		encodedSession = sessionID
	}
	return h.appURL + path + "?event_id=" + url.QueryEscape(eventID) + "&session_id=" + encodedSession
}

func (h *CheckoutHandler) checkoutCancelURL(client, eventID string) string {
	if client == checkoutClientNative {
		return h.appURL + "/checkout/native-return?event_id=" + url.QueryEscape(eventID) + "&cancelled=1"
	}
	return h.appURL + "/events/" + url.PathEscape(eventID) + "?checkout=cancelled"
}
