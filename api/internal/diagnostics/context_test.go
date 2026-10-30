package diagnostics

import (
	"testing"
	"time"
)

func TestDiagnosticContextValidationAndFingerprint(t *testing.T) {
	r := testReport(1)
	r.Operation, r.Failure, r.HTTPStatus = "tickets_load", "server_error", 503
	r.ErrorCode, r.SafeMessage, r.ErrorSource = "HTTP_SERVICE_UNAVAILABLE", diagnosticMessages["HTTP_SERVICE_UNAVAILABLE"], "api"
	r.Endpoint, r.HTTPMethod, r.RequestID = "tickets", "GET", "583f24c4-53cd-482e-a324-487a9b7c2846"
	h := &Handler{Store: &memoryStore{}, Now: func() time.Time { return testNow }}
	if w := ingest(h, body(r)); w.Code != 204 {
		t.Fatalf("new format rejected: %d", w.Code)
	}
	for _, mutate := range []func(*Report){
		func(r *Report) { r.ErrorCode = "private" }, func(r *Report) { r.SafeMessage = "private@example.test" },
		func(r *Report) { r.ErrorSource = "javascript" }, func(r *Report) { r.Endpoint = "/users/private" },
		func(r *Report) { r.RequestID = "Bearer private" }, func(r *Report) { r.HTTPMethod = "" },
		func(r *Report) { r.ErrorCode = "" }, func(r *Report) { r.HTTPStatus = 0 },
		func(r *Report) { r.Failure = "storage_error" }, func(r *Report) { r.Failure = "" },
	} {
		bad := r
		mutate(&bad)
		if ingest(h, body(bad)).Code != 400 {
			t.Fatal("unbounded context accepted")
		}
	}
	other := r
	other.RequestID = "d5924112-c54f-41c2-b2d0-5bd977a317d6"
	if fingerprint(r) != fingerprint(other) {
		t.Fatal("request IDs must not fragment fingerprints")
	}
	other.Endpoint = "orders"
	if fingerprint(r) == fingerprint(other) {
		t.Fatal("different endpoints should not group together")
	}
	other = r
	other.ErrorCode = "DATABASE_ERROR"
	other.SafeMessage = diagnosticMessages[other.ErrorCode]
	if fingerprint(r) == fingerprint(other) {
		t.Fatal("different causes should not group together")
	}
	other = r
	other.Operation, other.Failure, other.HTTPStatus, other.Endpoint, other.HTTPMethod, other.RequestID = "", "", 0, "", "", ""
	other.ErrorCode, other.SafeMessage = "AUTH_UNAVAILABLE", diagnosticMessages["AUTH_UNAVAILABLE"]
	if other.validContext() {
		t.Fatal("an unhandled property-access error cannot claim an authentication cause")
	}
}
