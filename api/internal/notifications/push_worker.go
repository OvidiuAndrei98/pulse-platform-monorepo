package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

type pushJob struct {
	ID, DeviceID, UserID, Lease, Token, Hash, Type, Language, Ticket string
	Attempts                                                         int
	Valid                                                            bool
	Expires                                                          time.Time
}
type expoResult struct {
	Status  string `json:"status"`
	ID      string `json:"id"`
	Details struct {
		Error string `json:"error"`
	} `json:"details"`
}

// No provider response text/tokens are logged, including malformed responses.
func (p *PushService) exchange(ctx context.Context, path string, body any, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	endpoint := p.Endpoint
	if endpoint == "" {
		endpoint = "https://exp.host/--/api/v2/push"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+path, bytes.NewReader(payload))
	if err != nil {
		return errors.New("push request invalid")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.AccessToken)
	client := p.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return errors.New("push provider unavailable")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return errors.New("push provider rejected request")
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 256*1024)).Decode(out); err != nil {
		return errors.New("push provider response invalid")
	}
	return nil
}

func pushCopy(kind, language string) (string, string) {
	if language == "ro" {
		switch kind {
		case "friend_request":
			return "Cerere de prietenie", "Ai primit o cerere nouă de prietenie."
		case "friend_accepted":
			return "Sunteți prieteni", "Cererea ta de prietenie a fost acceptată."
		case "ticket_purchased":
			return "Biletele tale sunt pregătite", "Le găsești în contul tău SPOTTR."
		case "organizer_event":
			return "Un eveniment nou", "Un organizator pe care îl urmărești a publicat un eveniment."
		case "safety_help":
			return "Grupul tău are nevoie de tine", "Deschide SPOTTR pentru a vedea mesajul din grup."
		default:
			return "SPOTTR", "Ai o notificare nouă. Deschide aplicația pentru detalii."
		}
	}
	switch kind {
	case "friend_request":
		return "Friend request", "You have a new friend request."
	case "friend_accepted":
		return "You're now friends", "Your friend request was accepted."
	case "ticket_purchased":
		return "Your tickets are ready", "Find them in your SPOTTR account."
	case "organizer_event":
		return "A new event", "An organizer you follow published an event."
	case "safety_help":
		return "Your group needs you", "Open SPOTTR to see the message from your group."
	default:
		return "SPOTTR", "You have a new notification. Open the app for details."
	}
}

func pushMessage(job pushJob, now time.Time) map[string]any {
	title, body := pushCopy(job.Type, job.Language)
	ttl := max(0, min(3600, int(job.Expires.Sub(now).Seconds())))
	if strings.HasPrefix(job.Type, "safety_") {
		ttl = min(ttl, 300)
	}
	return map[string]any{"to": job.Token, "title": title, "body": body, "sound": "default", "channelId": "spottr",
		"ttl": ttl, "data": map[string]string{"kind": "spottr_notification", "notificationId": job.ID, "userId": job.UserID}}
}

func (p *PushService) claim(ctx context.Context, state string) ([]pushJob, error) {
	rows, err := p.Pool.Query(ctx, `WITH candidate AS (
        SELECT notification_id,device_id FROM notification_push_deliveries
        WHERE state=$1 AND available_at<=clock_timestamp() ORDER BY available_at
        LIMIT 50 FOR UPDATE SKIP LOCKED
    ), claimed AS (
        UPDATE notification_push_deliveries d SET lease_id=gen_random_uuid(),
        available_at=clock_timestamp()+interval '2 minutes',attempts=attempts+1
        FROM candidate c WHERE d.notification_id=c.notification_id AND d.device_id=c.device_id
        RETURNING d.*
    ) SELECT c.notification_id::text,c.device_id::text,c.user_id::text,c.lease_id::text,d.expo_token,c.registration_hash,
        n.type,d.language,coalesce(c.ticket_id,''),c.attempts,
        (d.enabled AND d.user_id=c.user_id AND d.revoke_hash=c.registration_hash
         AND d.updated_at>clock_timestamp()-interval '30 days' AND n.read_at IS NULL
         AND c.created_at>clock_timestamp()-interval '24 hours'
         AND (n.expires_at IS NULL OR n.expires_at>clock_timestamp())
         AND (n.type NOT LIKE 'safety_%' OR EXISTS(SELECT 1 FROM tickets t JOIN orders o ON o.id=t.order_id
              WHERE o.event_id=n.event_id AND o.status='completed' AND (t.user_id=n.user_id OR (t.user_id IS NULL AND o.user_id=n.user_id))))),
        least(coalesce(n.expires_at,c.created_at+interval '24 hours'),c.created_at+interval '24 hours')
    FROM claimed c JOIN notification_push_devices d ON d.id=c.device_id JOIN notifications n ON n.id=c.notification_id`, state)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	jobs := []pushJob{}
	for rows.Next() {
		var j pushJob
		if err := rows.Scan(&j.ID, &j.DeviceID, &j.UserID, &j.Lease, &j.Token, &j.Hash, &j.Type, &j.Language, &j.Ticket, &j.Attempts, &j.Valid, &j.Expires); err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}

func (p *PushService) finish(ctx context.Context, job pushJob, state, ticket string, delay time.Duration) {
	_, err := p.Pool.Exec(ctx, `UPDATE notification_push_deliveries SET state=$5,ticket_id=nullif($6,''),
        available_at=clock_timestamp()+($7*interval '1 second'),attempts=CASE WHEN state<>$5 THEN 0 ELSE attempts END
        WHERE notification_id=$1 AND device_id=$2 AND user_id=$3 AND lease_id=$4`, job.ID, job.DeviceID, job.UserID, job.Lease, state, ticket, int(delay.Seconds()))
	if err != nil {
		log.Print("push delivery persistence deferred")
	}
}

func retryPush(job pushJob, receipt bool) (string, time.Duration) {
	if receipt {
		return "receipt", 15 * time.Minute
	}
	if job.Attempts >= 8 {
		return "dropped", 0
	}
	return "queued", time.Duration(1<<min(job.Attempts, 7)) * 15 * time.Second
}

func (p *PushService) result(ctx context.Context, job pushJob, result expoResult, receipt bool) {
	if result.Status == "ok" {
		if receipt {
			p.finish(ctx, job, "done", "", 0)
			return
		}
		if result.ID != "" && len(result.ID) < 200 {
			p.finish(ctx, job, "receipt", result.ID, 15*time.Minute)
			return
		}
	}
	if result.Status == "error" {
		switch result.Details.Error {
		case "DeviceNotRegistered":
			// A late receipt cannot disable a newer registration/account.
			_, err := p.Pool.Exec(ctx, `UPDATE notification_push_devices SET enabled=false WHERE id=$1 AND user_id=$2 AND revoke_hash=$3`, job.DeviceID, job.UserID, job.Hash)
			if err != nil {
				log.Print("push device disable deferred")
				break
			}
			p.finish(ctx, job, "dropped", "", 0)
			return
		case "MessageTooBig":
			p.finish(ctx, job, "dropped", "", 0)
			return
		}
	}
	state, delay := retryPush(job, receipt)
	p.finish(ctx, job, state, job.Ticket, delay)
}

func (p *PushService) runBatch(ctx context.Context, receipts bool) {
	state := "queued"
	if receipts {
		state = "receipt"
	}
	jobs, err := p.claim(ctx, state)
	if err != nil {
		if ctx.Err() == nil {
			log.Print("push queue temporarily unavailable")
		}
		return
	}
	active := []pushJob{}
	for _, job := range jobs {
		if !job.Valid {
			p.finish(ctx, job, "dropped", "", 0)
		} else {
			active = append(active, job)
		}
	}
	if len(active) == 0 {
		return
	}
	if receipts {
		ids := make([]string, 0, len(active))
		for _, job := range active {
			ids = append(ids, job.Ticket)
		}
		var response struct {
			Data map[string]expoResult `json:"data"`
		}
		err = p.exchange(ctx, "/getReceipts", map[string]any{"ids": ids}, &response)
		for _, job := range active {
			result := expoResult{}
			if err == nil {
				result = response.Data[job.Ticket]
			}
			p.result(ctx, job, result, true)
		}
	} else {
		payload := make([]map[string]any, 0, len(active))
		for _, job := range active {
			message := pushMessage(job, time.Now())
			message["data"].(map[string]string)["projectId"] = p.ProjectID
			payload = append(payload, message)
		}
		var response struct {
			Data []expoResult `json:"data"`
		}
		err = p.exchange(ctx, "/send", payload, &response)
		for i, job := range active {
			result := expoResult{}
			if err == nil && len(response.Data) == len(active) {
				result = response.Data[i]
			}
			p.result(ctx, job, result, false)
		}
	}
}

func (p *PushService) StartWorker(ctx context.Context) {
	if !p.configured() {
		return
	}
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		cleanupAt := time.Time{}
		for {
			runCtx, cancel := context.WithTimeout(ctx, 35*time.Second)
			p.runBatch(runCtx, false)
			p.runBatch(runCtx, true)
			if time.Now().After(cleanupAt) {
				// Bounded retention also removes rows exhausted during a provider outage.
				_, err := p.Pool.Exec(runCtx, `DELETE FROM notification_push_deliveries WHERE created_at<clock_timestamp()-interval '7 days'`)
				if err == nil {
					_, err = p.Pool.Exec(runCtx, `DELETE FROM notification_push_revocations WHERE created_at<clock_timestamp()-interval '7 days'`)
				}
				if err == nil {
					cleanupAt = time.Now().Add(time.Hour)
				}
			}
			cancel()
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}
