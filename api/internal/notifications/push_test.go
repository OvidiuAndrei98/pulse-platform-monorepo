package notifications

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPushValidation(t *testing.T) {
	valid := pushRegistration{Token: "ExpoPushToken[abcdefghijklmnop]", Secret: strings.Repeat("a", 64), Platform: "ios", Language: "ro"}
	if !valid.valid() {
		t.Fatal("valid registration rejected")
	}
	for _, mutate := range []func(*pushRegistration){
		func(v *pushRegistration) { v.Token = "https://example.test" },
		func(v *pushRegistration) { v.Token = "ExpoPushToken[]" },
		func(v *pushRegistration) { v.Secret = "short" },
		func(v *pushRegistration) { v.Platform = "web" },
		func(v *pushRegistration) { v.Language = "bad" },
	} {
		value := valid
		mutate(&value)
		if value.valid() {
			t.Fatal("invalid registration accepted")
		}
	}
	p := &PushService{ProjectID: "11111111-1111-4111-8111-111111111111"}
	if p.configured() {
		t.Fatal("require authenticated Expo push service")
	}
	p.AccessToken = "fixture"
	if !p.configured() {
		t.Fatal("valid config rejected")
	}
	if revokeHash(valid.Secret) == valid.Secret || len(revokeHash(valid.Secret)) != 64 {
		t.Fatal("capability must be hashed")
	}
}

func TestPushMessagesAndBoundedRetry(t *testing.T) {
	now := time.Now()
	job := pushJob{ID: "id", UserID: "owner", Type: "safety_help", Token: "opaque", Language: "ro", Expires: now.Add(time.Hour)}
	message := pushMessage(job, now)
	if message["ttl"] != 300 || message["title"] != "Grupul tău are nevoie de tine" {
		t.Fatal("safety alert must expire promptly")
	}
	data := message["data"].(map[string]string)
	if data["notificationId"] != "id" || data["userId"] != "owner" || len(data) != 3 {
		t.Fatal("bounded navigation payload required")
	}
	job.Expires = now.Add(-time.Second)
	if pushMessage(job, now)["ttl"] != 0 {
		t.Fatal("expired TTL")
	}
	job.Attempts = 1
	state, delay := retryPush(job, false)
	if state != "queued" || delay != 30*time.Second {
		t.Fatal("backoff")
	}
	job.Attempts = 8
	state, _ = retryPush(job, false)
	if state != "dropped" {
		t.Fatal("unbounded retry")
	}
	state, _ = retryPush(job, true)
	if state != "receipt" {
		t.Fatal("accepted push must never be sent twice while checking receipt")
	}
}

func TestExpoExchange(t *testing.T) {
	var code = 200
	var body = `{"data":[{"status":"ok","id":"receipt-fixture"}]}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/send" || r.Header.Get("Authorization") != "Bearer test-only" {
			t.Error("wrong provider request")
		}
		var payload []map[string]any
		if json.NewDecoder(r.Body).Decode(&payload) != nil || len(payload) != 1 {
			t.Error("invalid batch")
		}
		w.WriteHeader(code)
		_, _ = w.Write([]byte(body))
	}))
	defer server.Close()
	p := &PushService{Endpoint: server.URL, AccessToken: "test-only"}
	var response struct {
		Data []expoResult `json:"data"`
	}
	if err := p.exchange(context.Background(), "/send", []map[string]any{{"to": "fixture"}}, &response); err != nil || len(response.Data) != 1 || response.Data[0].ID != "receipt-fixture" {
		t.Fatal("provider response lost")
	}
	for _, bad := range []struct {
		code int
		body string
	}{{429, "private provider details"}, {503, "opaque token"}, {200, "invalid secret body"}} {
		code, body = bad.code, bad.body
		err := p.exchange(context.Background(), "/send", []map[string]any{{"to": "fixture"}}, &response)
		if err == nil || strings.Contains(err.Error(), bad.body) {
			t.Fatal("provider failure must be redacted")
		}
	}
}
