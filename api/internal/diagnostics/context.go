package diagnostics

import "strings"

func diagnosticSource(code string) string {
	if code == "DATABASE_ERROR" || code == "AUTH_UNAVAILABLE" {
		return "api"
	}
	if strings.HasPrefix(code, "HTTP_") || code == "INVALID_RESPONSE" {
		return "http"
	}
	if code == "STORAGE_ERROR" {
		return "storage"
	}
	if code == "SDK_ERROR" || code == "CONFIGURATION_ERROR" {
		return "payment_sdk"
	}
	if code == "FULFILLMENT_MISSING" {
		return "fulfillment"
	}
	if code == "NETWORK_ERROR" || code == "TIMEOUT" {
		return "network"
	}
	return "javascript"
}

var diagnosticMessages = map[string]string{
	"HTTP_SERVER_ERROR":        "The server could not complete the request.",
	"HTTP_SERVICE_UNAVAILABLE": "The service is temporarily unavailable.",
	"HTTP_GATEWAY_TIMEOUT":     "The gateway timed out waiting for the service.",
	"HTTP_BAD_GATEWAY":         "The gateway received an invalid response from the service.",
	"DATABASE_ERROR":           "The server reported a database operation failure.",
	"AUTH_UNAVAILABLE":         "The server could not verify the current account session.",
	"INVALID_RESPONSE":         "The response did not match the expected application format.",
	"STORAGE_ERROR":            "Local application data could not be read or saved.",
	"SDK_ERROR":                "The payment SDK could not complete its operation.",
	"CONFIGURATION_ERROR":      "The payment SDK configuration is unavailable or invalid.",
	"FULFILLMENT_MISSING":      "Payment was confirmed but the refreshed ticket was missing.",
	"JS_PROPERTY_ACCESS":       "JavaScript attempted to access a property on a missing value.",
	"JS_UNDEFINED_IDENTIFIER":  "JavaScript referenced an undefined identifier.",
	"JS_INVALID_HOOK":          "React detected an invalid hook call or hook order.",
	"JS_RENDER_ERROR":          "The application could not render this screen.",
	"NETWORK_ERROR":            "The application could not reach the service.",
	"TIMEOUT":                  "The operation exceeded its time limit.",
	"UNEXPECTED_ERROR":         "An unexpected application error occurred. Check the stack frames.",
}

func (r Report) validContext() bool {
	if r.ErrorCode != "" || r.SafeMessage != "" || r.ErrorSource != "" {
		message, ok := diagnosticMessages[r.ErrorCode]
		if !ok || r.SafeMessage != message {
			return false
		}
		if r.ErrorSource != diagnosticSource(r.ErrorCode) && !(r.ErrorSource == "api" && (strings.HasPrefix(r.ErrorCode, "HTTP_") || r.ErrorCode == "INVALID_RESPONSE")) {
			return false
		}
		if r.Failure == "server_error" {
			expected := "HTTP_SERVER_ERROR"
			switch r.HTTPStatus {
			case 503:
				expected = "HTTP_SERVICE_UNAVAILABLE"
			case 502:
				expected = "HTTP_BAD_GATEWAY"
			case 504:
				expected = "HTTP_GATEWAY_TIMEOUT"
			}
			if r.HTTPStatus < 500 || r.HTTPStatus > 599 || (r.ErrorCode != expected && r.ErrorCode != "DATABASE_ERROR" && r.ErrorCode != "AUTH_UNAVAILABLE") {
				return false
			}
		} else {
			failures := map[string]string{"invalid_response": "INVALID_RESPONSE", "storage_error": "STORAGE_ERROR", "sdk_error": "SDK_ERROR", "configuration": "CONFIGURATION_ERROR", "fulfillment_missing": "FULFILLMENT_MISSING"}
			categories := map[string]string{"property_access": "JS_PROPERTY_ACCESS", "undefined_identifier": "JS_UNDEFINED_IDENTIFIER", "invalid_hook": "JS_INVALID_HOOK", "render_exception": "JS_RENDER_ERROR", "network": "NETWORK_ERROR", "timeout": "TIMEOUT", "unknown": "UNEXPECTED_ERROR"}
			expected := categories[r.Category]
			if r.Failure != "" {
				expected = failures[r.Failure]
			}
			if r.ErrorCode != expected || r.HTTPStatus != 0 {
				return false
			}
		}
	}
	if r.Endpoint != "" || r.HTTPMethod != "" || r.RequestID != "" {
		if r.ErrorCode == "" || r.Failure != "server_error" || !oneOf(r.ErrorSource, "http|api") || r.HTTPStatus < 500 || r.HTTPStatus > 599 ||
			!oneOf(r.Endpoint, "tickets|orders|events|event|event_social|event_friends|feed|notifications|friends|profile|dashboard|checkout|scanner|other") ||
			!oneOf(r.HTTPMethod, "GET|POST|PUT|PATCH|DELETE") {
			return false
		}
		if r.RequestID != "" && !requestID.MatchString(r.RequestID) {
			return false
		}
	}
	return true
}
