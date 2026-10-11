package payments

import (
	"net/url"
	"strings"
)

const checkoutClientNative = "native"
const checkoutClientNativeWeb = "native_web"

// Exact origins only, never wildcard domains or user-provided return paths.
func (h *CheckoutHandler) ConfigureWebCheckoutReturns(origins string) {
	h.webReturnOrigins = make(map[string]bool)
	for _, origin := range strings.Split(origins, ",") {
		origin = strings.TrimSpace(origin)
		if validWebReturnOrigin(origin) {
			h.webReturnOrigins[origin] = true
		}
	}
}

func validWebReturnOrigin(origin string) bool {
	u, err := url.Parse(origin)
	return err == nil && u.Host != "" && u.User == nil && u.Opaque == "" && u.Path == "" && u.RawQuery == "" && !u.ForceQuery && u.Fragment == "" && u.RawFragment == "" &&
		(u.Scheme == "https" || (u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"))) && u.String() == origin
}

func (h *CheckoutHandler) allowedWebReturnOrigin(origin string) bool {
	if !validWebReturnOrigin(origin) {
		return false
	}
	if h.webReturnOrigins[origin] {
		return true
	}
	// Local Expo previews are allowed only for test-mode payments. Live payments
	// and deployed web builds require the explicit server-side origin allowlist.
	u, _ := url.Parse(origin)
	return h.expectedLiveModeKnown && !h.expectedLiveMode && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1")
}

// Legacy clients keep their fixed routes; Expo web uses a validated origin and fixed path.
func (h *CheckoutHandler) checkoutSuccessURL(client, eventID, sessionID string, origins ...string) string {
	path := "/checkout/success"
	if client == checkoutClientNative {
		path = "/checkout/native-return"
	}
	encodedSession := url.QueryEscape(sessionID)
	if sessionID == "{CHECKOUT_SESSION_ID}" {
		// Stripe replaces this literal placeholder after creating the Session.
		encodedSession = sessionID
	}
	if client == checkoutClientNativeWeb && len(origins) == 1 && h.allowedWebReturnOrigin(origins[0]) {
		return origins[0] + "/checkout/return?eventId=" + url.QueryEscape(eventID) + "&sessionId=" + encodedSession
	}
	return h.appURL + path + "?event_id=" + url.QueryEscape(eventID) + "&session_id=" + encodedSession
}

func (h *CheckoutHandler) checkoutCancelURL(client, eventID string, origins ...string) string {
	if client == checkoutClientNativeWeb && len(origins) == 1 && h.allowedWebReturnOrigin(origins[0]) {
		return origins[0] + "/checkout/return?eventId=" + url.QueryEscape(eventID) + "&cancelled=1"
	}
	if client == checkoutClientNative {
		return h.appURL + "/checkout/native-return?event_id=" + url.QueryEscape(eventID) + "&cancelled=1"
	}
	return h.appURL + "/events/" + url.PathEscape(eventID) + "?checkout=cancelled"
}
