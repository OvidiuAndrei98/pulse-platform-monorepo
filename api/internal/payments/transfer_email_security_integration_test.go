package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http/httptest"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/email"
	"pulse-api/internal/outings"
	"testing"
)

type transferDeliveryRecorder struct {
	sent [][]email.TicketDelivery
	to   []string
}

func (m *transferDeliveryRecorder) SendTicketConfirmationEmail(_ context.Context, to, _ string, _ string, _ bool, _ bool, tickets []email.TicketDelivery) error {
	m.to = append(m.to, to)
	m.sent = append(m.sent, append([]email.TicketDelivery(nil), tickets...))
	return nil
}
func TestEmailRetryCannotExposeTransferredAdmissionCodes(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	ctx := context.Background()
	mailer := &transferDeliveryRecorder{}
	h := &CheckoutHandler{queries: db.New(pool), db: pool, mailer: mailer}
	var order pgtype.UUID
	err := pool.QueryRow(ctx, `INSERT INTO orders(user_id,event_id,email,total_amount,status) VALUES($1,$2,$3,100,'completed') RETURNING id`, f.buyerID, f.eventID, f.buyerEmail).Scan(&order)
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		hash, e := generateValidationHash()
		if e != nil {
			t.Fatal(e)
		}
		if _, e = h.queries.CreateTicket(ctx, db.CreateTicketParams{OrderID: order, TicketTypeID: f.paidTicketID, UserID: f.buyerID, ValidationHash: hash}); e != nil {
			t.Fatal(e)
		}
	}
	original, err := h.queries.ListOrderTicketEmailDetails(ctx, order)
	if err != nil || len(original) != 2 {
		t.Fatal("expected two buyer tickets", err)
	}
	routes := (&outings.Handler{Pool: pool}).Routes()
	call := func(path string, body any, actor pgtype.UUID) *httptest.ResponseRecorder {
		payload, _ := json.Marshal(body)
		r := httptest.NewRequest("POST", path, bytes.NewReader(payload))
		r = r.WithContext(context.WithValue(r.Context(), auth.UserIDKey, common.UUIDToString(actor)))
		w := httptest.NewRecorder()
		routes.ServeHTTP(w, r)
		return w
	}
	transferTicket := func(ticket pgtype.UUID) {
		t.Helper()
		var key string
		if err = pool.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&key); err != nil {
			t.Fatal(err)
		}
		w := call("/transfers", map[string]string{"ticketId": common.UUIDToString(ticket), "recipientEmail": f.secondBuyerEmail, "requestId": key}, f.buyerID)
		if w.Code != 201 {
			t.Fatal("create failed", w.Code, w.Body.String())
		}
		var x struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &x)
		w = call("/transfers/"+x.ID+"/respond", map[string]string{"status": "accepted"}, f.secondBuyerID)
		if w.Code != 200 {
			t.Fatal("accept failed", w.Code, w.Body.String())
		}
	}
	transferTicket(original[0].TicketID)
	var rotated string
	if err = pool.QueryRow(ctx, `SELECT validation_hash FROM tickets WHERE id=$1`, original[0].TicketID).Scan(&rotated); err != nil {
		t.Fatal(err)
	}
	if err = h.deliverTicketConfirmation(order); err != nil {
		t.Fatal(err)
	}
	if len(mailer.sent) != 1 || len(mailer.sent[0]) != 1 || mailer.to[0] != f.buyerEmail || mailer.sent[0][0].ValidationHash != original[1].ValidationHash || mailer.sent[0][0].ValidationHash == rotated {
		t.Fatal("email retry leaked or misrouted an admission code")
	}
	transferTicket(original[1].TicketID)
	if _, err = pool.Exec(ctx, `UPDATE orders SET ticket_email_sent_at=NULL,ticket_email_next_attempt_at=now()-interval '1 second' WHERE id=$1`, order); err != nil {
		t.Fatal(err)
	}
	if err = h.deliverTicketConfirmation(order); err != nil {
		t.Fatal(err)
	}
	if len(mailer.sent) != 1 {
		t.Fatal("all-transferred order sent an email")
	}
	var sent pgtype.Timestamptz
	if err = pool.QueryRow(ctx, `SELECT ticket_email_sent_at FROM orders WHERE id=$1`, order).Scan(&sent); err != nil || !sent.Valid {
		t.Fatal("empty delivery was not completed")
	}
	if err = h.deliverTicketConfirmation(order); err != nil || len(mailer.sent) != 1 {
		t.Fatal("empty delivery retried")
	}
}
