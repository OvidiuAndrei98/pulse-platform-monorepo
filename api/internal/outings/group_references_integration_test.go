package outings

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestParallelProposeKeepsOneCanonicalSourceThroughDatabaseAndReconnect(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	want(t, f.call("POST", "/groups/"+g.ID+"/messages", map[string]any{"requestId": key(t, f), "content": "The member shared this", "eventId": sid(f.event)}, f.users[1]), 201)
	initial, _ := messagesAs(t, f, g, f.users[0], "")
	source := initial[0]
	drafts := []map[string]any{
		{"requestId": key(t, f), "eventId": sid(f.event), "sourceMessageId": source.ID},
		{"requestId": key(t, f), "eventId": sid(f.event), "sourceMessageId": source.ID},
	}
	results := make([]*httptest.ResponseRecorder, 2)
	start := make(chan struct{})
	var work sync.WaitGroup
	for i := range results {
		work.Add(1)
		go func(i int) {
			defer work.Done()
			<-start
			results[i] = f.call("POST", "/groups/"+g.ID+"/outings", drafts[i], f.users[i])
		}(i)
	}
	close(start)
	work.Wait()
	var first plan
	created := 0
	for i, response := range results {
		if response.Code == 201 {
			created++
		} else {
			want(t, response, 200)
		}
		var got plan
		if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			first = got
		}
		if got.ID != first.ID || len(got.Options) != 1 || got.Options[0].ReferenceMessageID != source.ID {
			t.Fatalf("parallel proposal changed canonical identity: %+v", got)
		}
		want(t, f.call("POST", "/groups/"+g.ID+"/outings", drafts[i], f.users[i]), 200)
	}
	if created != 1 {
		t.Fatalf("created %d outings, want exactly one", created)
	}
	var raw, canonical, audit, unbound int
	err := f.pool.QueryRow(context.Background(), `SELECT count(*),
 count(*) FILTER(WHERE outing_context->>'referenceMessageId'=id::text),
 count(*) FILTER(WHERE outing_context->>'referenceMessageId'=$2 AND id::text<>$2),
 count(*) FILTER(WHERE outing_id IS NULL)
 FROM friend_group_messages WHERE group_id=$1 AND event_id=$3`, g.ID, source.ID, f.event).Scan(&raw, &canonical, &audit, &unbound)
	if err != nil {
		t.Fatal(err)
	}
	if raw != 2 || canonical != 1 || audit != 1 || unbound != 0 {
		t.Fatalf("database reference counts raw/canonical/audit/unbound=%d/%d/%d/%d", raw, canonical, audit, unbound)
	}
	// A fresh handler has no client cache, and both accepted accounts see the same
	// source identity through repeated reads. Audit history remains a separate row.
	f.handler = &Handler{Pool: f.pool}
	for _, actor := range f.users[:2] {
		for pass := 0; pass < 3; pass++ {
			current, _ := messagesAs(t, f, g, actor, "?references="+source.ID)
			if len(current) != 2 {
				t.Fatalf("reconnect returned %d raw rows", len(current))
			}
			count := 0
			for _, row := range current {
				if row.OutingID != first.ID || row.ReferenceMessageID != source.ID {
					t.Fatalf("missing authoritative reference in projected row: %+v", row)
				}
				if row.ID == source.ID {
					count++
					if row.Seq != source.Seq || row.SenderID != source.SenderID || row.Content != source.Content || !row.CreatedAt.Equal(source.CreatedAt) {
						t.Fatal("proposal changed the original sender, content, time or ordering anchor")
					}
				}
			}
			if count != 1 {
				t.Fatal("reference returned more than once in the ordinary page")
			}
		}
	}
	for _, answer := range []string{"yes", "no", "unanswered", "unanswered", "yes"} {
		attendanceAs(t, f, first, f.users[1], answer)
	}
	ending, _ := messagesAs(t, f, g, f.users[0], "")
	if len(ending) != raw {
		t.Fatal("responses or withdrawal appended another poster/audit")
	}
}

func TestMissingSourceDoesNotGuessWhichIntentionalShareToAssociate(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	for _, text := range []string{"First independent share", "Second independent share"} {
		want(t, f.call("POST", "/groups/"+g.ID+"/messages", map[string]any{"requestId": key(t, f), "content": text, "eventId": sid(f.event)}, f.users[1]), 201)
	}
	before, _ := messagesAs(t, f, g, f.users[0], "")
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	after, _ := messagesAs(t, f, g, f.users[1], "")
	if len(after) != 3 || p.Options[0].ReferenceMessageID == before[0].ID || p.Options[0].ReferenceMessageID == before[1].ID {
		t.Fatal("a request without source identity guessed a previous shared occurrence")
	}
	for _, row := range after[1:] {
		if row.OutingID != "" || row.ReferenceMessageID != "" {
			t.Fatal("an independent intentional share was globally rebound by event ID")
		}
	}
	if after[0].ReferenceMessageID != after[0].ID || after[0].OutingID != p.ID {
		t.Fatal("standalone proposal did not create its own canonical reference")
	}
}

func TestExplicitGroupReferenceRetainsSourceAndResponsesDoNotRepeatPoster(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	want(t, f.call("POST", "/groups/"+g.ID+"/messages", map[string]any{"requestId": key(t, f), "content": "Come with me", "eventId": sid(f.event)}, f.users[1]), 201)
	before, _ := messagesAs(t, f, g, f.users[0], "")
	source := before[0]
	draft := map[string]any{"requestId": key(t, f), "eventId": sid(f.event), "sourceMessageId": source.ID}
	p := createOuting(t, f, g, f.users[0], draft)
	if p.Options[0].ReferenceMessageID != source.ID {
		t.Fatalf("option reference=%s source=%s", p.Options[0].ReferenceMessageID, source.ID)
	}
	msgs, _ := messagesAs(t, f, g, f.users[1], "")
	canonical := msgs[len(msgs)-1]
	if canonical.ID != source.ID || canonical.SenderID != source.SenderID || !canonical.CreatedAt.Equal(source.CreatedAt) || canonical.Content != source.Content || canonical.OutingID != p.ID || canonical.ReferenceMessageID != source.ID {
		t.Fatalf("source was replaced or misattributed: %+v", canonical)
	}
	if msgs[0].ReferenceMessageID != source.ID || msgs[0].ID == source.ID {
		t.Fatal("creation audit did not point at canonical source")
	}
	want(t, f.call("POST", "/groups/"+g.ID+"/outings", draft, f.users[0]), 200)
	attendanceAs(t, f, p, f.users[1], "yes")
	attendanceAs(t, f, p, f.users[1], "unanswered")
	after := readAs(t, f, p.ID, f.users[0])
	if member(after, f.users[1]).Attendance != "unanswered" {
		t.Fatal("withdraw did not clear current personal response")
	}
	revision := after.Revision
	attendanceAs(t, f, after, f.users[1], "unanswered")
	if readAs(t, f, p.ID, f.users[0]).Revision != revision {
		t.Fatal("withdraw retry created revision")
	}
	end, _ := messagesAs(t, f, g, f.users[0], "")
	if len(end) != len(msgs) {
		t.Fatal("RSVP/retry appended another poster")
	}
	// The same explicit tuple always reuses its source, even via another request.
	reused := f.call("POST", "/groups/"+g.ID+"/outings", map[string]any{"requestId": key(t, f), "eventId": sid(f.event), "sourceMessageId": source.ID}, f.users[1])
	want(t, reused, 200)
	var p2 plan
	if err := json.Unmarshal(reused.Body.Bytes(), &p2); err != nil {
		t.Fatal(err)
	}
	if p2.ID != p.ID || p2.Options[0].ReferenceMessageID != source.ID {
		t.Fatal("existing outing lost canonical identity")
	}
	for i := 0; i < 55; i++ {
		want(t, f.call("POST", "/groups/"+g.ID+"/messages", map[string]any{"requestId": key(t, f), "content": "History filler"}, f.users[0]), 201)
	}
	response := f.call("GET", "/groups/"+g.ID+"/messages?references="+source.ID, nil, f.users[1])
	want(t, response, 200)
	var page struct {
		Items      []groupMessage `json:"items"`
		References []groupMessage `json:"references"`
		HasMore    bool           `json:"hasMore"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 50 || !page.HasMore || len(page.References) != 1 || page.References[0].ID != source.ID || page.References[0].OutingID != p.ID {
		t.Fatalf("cached old source was not refreshed independently of pagination: %+v", page)
	}
	// A history boundary excludes both the message and its reference metadata.
	mustExec(t, f.pool, `UPDATE friend_group_members SET visible_after_seq=$3 WHERE group_id=$1 AND user_id=$2`, g.ID, f.users[1], source.Seq)
	response = f.call("GET", "/groups/"+g.ID+"/messages?references="+source.ID, nil, f.users[1])
	want(t, response, 200)
	if err := json.Unmarshal(response.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if len(page.References) != 0 {
		t.Fatal("reference endpoint leaked pre-membership history")
	}
}

func TestExplicitReferencesSeparateOutingsAndRejectStalePreferences(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	var day string
	if err := f.pool.QueryRow(context.Background(), `SELECT ((start_time AT TIME ZONE 'Europe/Bucharest')-interval '6 hours')::date::text FROM events WHERE id=$1`, f.event).Scan(&day); err != nil {
		t.Fatal(err)
	}
	p := createOuting(t, f, g, f.users[0], map[string]any{"date": day, "city": "Bucuresti"})
	want(t, f.call("POST", "/groups/"+g.ID+"/messages", map[string]any{"requestId": key(t, f), "content": "", "eventId": sid(f.event)}, f.users[1]), 201)
	msgs, _ := messagesAs(t, f, g, f.users[0], "")
	source := msgs[0]
	want(t, f.call("POST", "/plans/"+p.ID+"/proposals", map[string]any{"eventId": sid(f.event), "sourceMessageId": source.ID, "revision": p.Revision}, f.users[1]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	if p.Options[0].ReferenceMessageID != source.ID {
		t.Fatal("proposal did not bind explicit source")
	}
	want(t, f.call("POST", "/plans/"+p.ID+"/vote", map[string]any{"eventId": sid(f.event), "answer": "yes", "revision": p.Revision}, f.users[1]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	want(t, f.call("POST", "/plans/"+p.ID+"/choose", map[string]any{"eventId": sid(f.event), "revision": p.Revision}, f.users[0]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	attendanceAs(t, f, p, f.users[1], "yes")
	p = readAs(t, f, p.ID, f.users[0])
	oldRound := p.DecisionRound
	night, _ := time.Parse("2006-01-02", day)
	updated := contextCall(t, f, p, map[string]any{"date": night.AddDate(0, 0, 1).Format("2006-01-02"), "city": "Bucuresti", "confirmImpact": true}, 0, 200)
	if updated.Options[0].Available || updated.Options[0].ReferenceMessageID != source.ID {
		t.Fatal("context edit lost history or advertised incompatible event")
	}
	stale := f.call("POST", "/plans/"+p.ID+"/vote", map[string]any{"eventId": sid(f.event), "answer": "yes", "revision": p.Revision}, f.users[1])
	want(t, stale, 409)
	fresh := f.call("POST", "/plans/"+p.ID+"/vote", map[string]any{"eventId": sid(f.event), "answer": "yes", "revision": updated.Revision}, f.users[1])
	want(t, fresh, 409)
	var denied map[string]string
	_ = json.Unmarshal(fresh.Body.Bytes(), &denied)
	if denied["error"] != "EVENT_UNAVAILABLE" {
		t.Fatalf("wrong rejection: %s", fresh.Body.String())
	}
	want(t, f.call("POST", "/plans/"+p.ID+"/attendance", map[string]any{"answer": "unanswered", "decisionRound": oldRound}, f.users[1]), 409)
	want(t, f.call("POST", "/groups/"+g.ID+"/messages", map[string]any{"requestId": key(t, f), "content": "Again for this night", "eventId": sid(f.event)}, f.users[0]), 201)
	msgs, _ = messagesAs(t, f, g, f.users[0], "")
	secondSource := msgs[0]
	second := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event), "sourceMessageId": secondSource.ID})
	if second.ID == p.ID || second.Options[0].ReferenceMessageID != secondSource.ID || second.Options[0].ReferenceMessageID == source.ID {
		t.Fatal("same event in another outing was globally deduplicated")
	}
	want(t, f.call("POST", "/groups/"+g.ID+"/outings", map[string]any{"requestId": key(t, f), "eventId": sid(f.event), "sourceMessageId": source.ID}, f.users[0]), 409)
}

func TestExplicitReferenceRejectsWrongOccurrenceAndForeignGroup(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	other := makeGroup(t, f, true)
	want(t, f.call("POST", "/groups/"+g.ID+"/messages", map[string]any{"requestId": key(t, f), "content": "", "eventId": sid(f.event)}, f.users[1]), 201)
	msgs, _ := messagesAs(t, f, g, f.users[0], "")
	source := msgs[0]
	for _, input := range []struct{ group, event string }{{other.ID, sid(f.event)}, {g.ID, sid(f.otherEvent)}} {
		want(t, f.call("POST", "/groups/"+input.group+"/outings", map[string]any{"requestId": key(t, f), "eventId": input.event, "sourceMessageId": source.ID}, f.users[0]), 404)
	}
	var count int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM outing_plans WHERE group_id=ANY($1::uuid[])`, []string{g.ID, other.ID}).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("invalid source persisted partial plan")
	}
}
