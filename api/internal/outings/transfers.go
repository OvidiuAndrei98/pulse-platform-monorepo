package outings

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"pulse-api/internal/router"
)

type transfer struct {
	ID            string    `json:"id"`
	TicketID      string    `json:"ticketId"`
	EventID       string    `json:"eventId"`
	EventTitle    string    `json:"eventTitle"`
	SenderID      string    `json:"senderId"`
	SenderName    string    `json:"senderName"`
	RecipientID   string    `json:"recipientId"`
	RecipientName string    `json:"recipientName"`
	Status        string    `json:"status"`
	ExpiresAt     time.Time `json:"expiresAt"`
}

const transferSelect = `SELECT x.id::text,x.ticket_id::text,o.event_id::text,e.title,x.sender_id::text,s.username,
    CASE WHEN x.status='accepted' OR u.id=$1 THEN COALESCE(x.recipient_id::text,'') ELSE '' END,
    CASE WHEN x.status='accepted' OR u.id=$1 THEN COALESCE(u.username,'') ELSE '' END,
    CASE WHEN x.status='pending' AND (x.expires_at<=CURRENT_TIMESTAMP OR e.ticket_transfers_locked OR e.start_time<=CURRENT_TIMESTAMP
        OR NOT s.is_active
        OR e.status NOT IN ('published','scheduled') OR o.status<>'completed' OR o.stripe_refund_status<>'none'
        OR o.stripe_amount_refunded_bani>0 OR o.stripe_refund_needs_attention OR t.is_validated OR t.user_id IS DISTINCT FROM x.sender_id
        OR EXISTS(SELECT 1 FROM order_refund_operations rf WHERE rf.order_id=o.id)) THEN 'expired' ELSE x.status END,x.expires_at
    FROM ticket_transfers x JOIN tickets t ON t.id=x.ticket_id JOIN orders o ON o.id=t.order_id JOIN events e ON e.id=o.event_id
    JOIN users s ON s.id=x.sender_id LEFT JOIN users u ON u.id=x.recipient_id `

func scanTransfer(row pgx.Row) (transfer, error) {
	var x transfer
	err := row.Scan(&x.ID, &x.TicketID, &x.EventID, &x.EventTitle, &x.SenderID, &x.SenderName, &x.RecipientID, &x.RecipientName, &x.Status, &x.ExpiresAt)
	return x, err
}
func (h *Handler) listTransfers(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	if err := expireTransfers(r.Context(), h.Pool, actor); err != nil {
		return err
	}
	rows, err := h.Pool.Query(r.Context(), transferSelect+` WHERE (x.sender_id=$1 OR x.recipient_id=$1 OR x.recipient_id IS NULL AND x.recipient_email=(SELECT lower(u.email) FROM users u WHERE u.id=$1 AND u.is_active AND (SELECT count(*) FROM users other WHERE lower(other.email)=lower(u.email) AND other.is_active)=1)) AND x.created_at>CURRENT_TIMESTAMP-interval '90 days' ORDER BY x.created_at DESC LIMIT 100`, actor)
	if err != nil {
		return err
	}
	defer rows.Close()
	result := make([]transfer, 0)
	for rows.Next() {
		x, e := scanTransfer(rows)
		if e != nil {
			return e
		}
		result = append(result, x)
	}
	if rows.Err() != nil {
		return rows.Err()
	}
	router.RespondWithJSON(w, 200, result)
	return nil
}

func expireTransfers(ctx context.Context, q queryer, actor pgtype.UUID) error {
	_, err := q.Exec(ctx, `UPDATE ticket_transfers x SET status='expired',responded_at=CURRENT_TIMESTAMP
        FROM tickets t,orders o,events e
        WHERE x.status='pending' AND t.id=x.ticket_id AND o.id=t.order_id AND e.id=o.event_id
        AND ($1::uuid IS NULL OR x.sender_id=$1 OR x.recipient_id=$1 OR x.recipient_id IS NULL AND x.recipient_email=(SELECT lower(email) FROM users WHERE id=$1))
        AND (x.expires_at<=CURRENT_TIMESTAMP OR e.ticket_transfers_locked OR e.start_time<=CURRENT_TIMESTAMP
          OR NOT EXISTS(SELECT 1 FROM users sender WHERE sender.id=x.sender_id AND sender.is_active)
          OR e.status NOT IN ('published','scheduled') OR o.status<>'completed' OR o.stripe_refund_status<>'none'
          OR o.stripe_amount_refunded_bani>0 OR o.stripe_refund_needs_attention OR t.is_validated OR t.user_id IS DISTINCT FROM x.sender_id
          OR EXISTS(SELECT 1 FROM order_refund_operations rf WHERE rf.order_id=o.id))`, actor)
	return err
}

// Pending invitation rows form a durable outbox. Account lookup is asynchronous,
// never part of the create response, and runs only for unambiguous active emails.
func deliverTransferNotifications(ctx context.Context, q queryer) error {
	_, err := q.Exec(ctx, `WITH target AS MATERIALIZED (
      SELECT x.id,x.sender_id,x.expires_at,u.id AS recipient FROM ticket_transfers x JOIN users u ON lower(u.email)=x.recipient_email AND u.is_active
      JOIN users sender ON sender.id=x.sender_id AND sender.is_active
      WHERE x.status='pending' AND x.notified_at IS NULL AND x.expires_at>CURRENT_TIMESTAMP
        AND NOT EXISTS(SELECT 1 FROM users other WHERE lower(other.email)=lower(u.email) AND other.is_active AND other.id<>u.id)
      ORDER BY x.created_at FOR UPDATE OF x SKIP LOCKED LIMIT 50
    ), sent AS (
      INSERT INTO notifications(user_id,type,title,body,actor_id,expires_at)
      SELECT recipient,'ticket_transfer','Ticket transfer','You have a ticket transfer invitation.',sender_id,expires_at FROM target RETURNING id
    ) UPDATE ticket_transfers SET notified_at=CURRENT_TIMESTAMP WHERE id IN(SELECT id FROM target) AND EXISTS(SELECT 1 FROM sent)`)
	return err
}

type transferTicket struct {
	id, orderID, eventID, owner              pgtype.UUID
	start                                    time.Time
	eventStatus, orderStatus, refund         string
	locked, used, attention, refundOperation bool
	refunded                                 int64
}

// User locks precede event/order/ticket locks, matching account deletion. Sorting
// prevents two reciprocal transfers from taking their account locks backwards.
func lockActiveUsers(ctx context.Context, tx pgx.Tx, ids []pgtype.UUID) error {
	rows, err := tx.Query(ctx, `SELECT id,is_active FROM users WHERE id=ANY($1::UUID[]) ORDER BY id FOR SHARE`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var id pgtype.UUID
		var active bool
		if err = rows.Scan(&id, &active); err != nil {
			return err
		}
		if !active {
			return conflict("TRANSFER_CLOSED")
		}
		count++
	}
	if rows.Err() != nil {
		return rows.Err()
	}
	if count != len(ids) {
		return conflict("TRANSFER_CLOSED")
	}
	return nil
}

// All transfer commands and offline preparation serialize on the event first.
// Financial ownership and refund operations remain attached to the original order.
func lockTransferTicket(ctx context.Context, tx pgx.Tx, ticketID pgtype.UUID, requireEligible bool) (transferTicket, error) {
	var t transferTicket
	t.id = ticketID
	err := tx.QueryRow(ctx, `SELECT order_id,o.event_id FROM tickets t JOIN orders o ON o.id=t.order_id WHERE t.id=$1`, ticketID).Scan(&t.orderID, &t.eventID)
	if err != nil {
		return t, err
	}
	err = tx.QueryRow(ctx, `SELECT start_time,status,ticket_transfers_locked FROM events WHERE id=$1 FOR UPDATE`, t.eventID).Scan(&t.start, &t.eventStatus, &t.locked)
	if err != nil {
		return t, err
	}
	if requireEligible && (t.locked || !time.Now().Before(t.start) || t.eventStatus != "published" && t.eventStatus != "scheduled") {
		return t, conflict("TRANSFER_WINDOW_CLOSED")
	}
	var snapshotExists bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM offline_validation_snapshots WHERE event_id=$1)`, t.eventID).Scan(&snapshotExists); err != nil {
		return t, err
	}
	if requireEligible && snapshotExists {
		return t, conflict("TRANSFER_WINDOW_CLOSED")
	}
	err = tx.QueryRow(ctx, `SELECT status,stripe_refund_status,stripe_amount_refunded_bani,stripe_refund_needs_attention FROM orders WHERE id=$1 FOR UPDATE`, t.orderID).
		Scan(&t.orderStatus, &t.refund, &t.refunded, &t.attention)
	if err != nil {
		return t, err
	}
	err = tx.QueryRow(ctx, `SELECT user_id,is_validated FROM tickets WHERE id=$1 FOR UPDATE`, ticketID).Scan(&t.owner, &t.used)
	if err != nil {
		return t, err
	}
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM order_refund_operations WHERE order_id=$1)`, t.orderID).Scan(&t.refundOperation)
	return t, err
}
func (t transferTicket) eligible(actor pgtype.UUID, now time.Time) error {
	if !t.owner.Valid || t.owner != actor {
		return missing()
	}
	if t.locked || !now.Before(t.start) {
		return conflict("TRANSFER_WINDOW_CLOSED")
	}
	if t.used || t.orderStatus != "completed" || t.eventStatus != "published" && t.eventStatus != "scheduled" || t.refund != "none" || t.refunded != 0 || t.attention || t.refundOperation {
		return conflict("TICKET_NOT_TRANSFERABLE")
	}
	return nil
}
func (h *Handler) createTransfer(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	var req struct {
		TicketID       string `json:"ticketId"`
		RecipientEmail string `json:"recipientEmail"`
		RequestID      string `json:"requestId"`
	}
	if err := body(r, &req); err != nil {
		return err
	}
	ticketID, err := uuid(req.TicketID)
	if err != nil {
		return err
	}
	key, err := uuid(req.RequestID)
	if err != nil {
		return err
	}
	email := strings.ToLower(strings.TrimSpace(req.RecipientEmail))
	address, e := mail.ParseAddress(email)
	if e != nil || address.Address != email || len(email) > 254 {
		return invalid("RECIPIENT_UNAVAILABLE")
	}
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	if err = lockActiveUsers(r.Context(), tx, []pgtype.UUID{actor}); err != nil {
		return err
	}
	// Serialize the same sender/key across different ticket IDs before locking an event.
	if _, err = tx.Exec(r.Context(), `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, sid(actor)+":"+sid(key)); err != nil {
		return err
	}
	existing, e := scanTransfer(tx.QueryRow(r.Context(), transferSelect+` WHERE x.sender_id=$1 AND x.request_id=$2`, actor, key))
	if e == nil {
		var sameEmail bool
		if err = tx.QueryRow(r.Context(), `SELECT recipient_email=$2 FROM ticket_transfers WHERE id=$1`, existing.ID, email).Scan(&sameEmail); err != nil {
			return err
		}
		if existing.TicketID != sid(ticketID) || !sameEmail {
			return conflict("REQUEST_REUSED")
		}
		router.RespondWithJSON(w, 200, existing)
		return nil
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		return e
	}
	t, err := lockTransferTicket(r.Context(), tx, ticketID, true)
	if err != nil {
		return err
	}
	if err = t.eligible(actor, time.Now()); err != nil {
		return err
	}
	// Do not look up accounts: a valid email always creates the same invitation.
	// The authenticated recipient is bound only when they explicitly respond.
	if _, err = tx.Exec(r.Context(), `UPDATE ticket_transfers SET status='expired',responded_at=CURRENT_TIMESTAMP WHERE ticket_id=$1 AND status='pending' AND expires_at<=CURRENT_TIMESTAMP`, ticketID); err != nil {
		return err
	}
	var pending bool
	if err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM ticket_transfers WHERE ticket_id=$1 AND status='pending')`, ticketID).Scan(&pending); err != nil {
		return err
	}
	if pending {
		return conflict("TRANSFER_PENDING")
	}
	expires := time.Now().Add(24 * time.Hour)
	if t.start.Before(expires) {
		expires = t.start
	}
	var id pgtype.UUID
	err = tx.QueryRow(r.Context(), `INSERT INTO ticket_transfers(ticket_id,sender_id,recipient_email,request_id,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING id`, ticketID, actor, email, key, expires).Scan(&id)
	if err != nil {
		return err
	}
	x, err := scanTransfer(tx.QueryRow(r.Context(), transferSelect+` WHERE x.id=$2`, actor, id))
	if err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	router.RespondWithJSON(w, 201, x)
	return nil
}
func (h *Handler) respondTransfer(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	id, err := uuid(chi.URLParam(r, "transferID"))
	if err != nil {
		return err
	}
	var req struct {
		Status string `json:"status"`
	}
	if err = body(r, &req); err != nil {
		return err
	}
	if req.Status != "accepted" && req.Status != "declined" && req.Status != "cancelled" {
		return invalid("INVALID_STATUS")
	}
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var ticketID, sender, recipient pgtype.UUID
	var recipientEmail, initialStatus string
	err = tx.QueryRow(r.Context(), `SELECT ticket_id,sender_id,recipient_id,recipient_email,status FROM ticket_transfers WHERE id=$1 AND (sender_id=$2 OR recipient_id=$2 OR recipient_id IS NULL AND recipient_email=(SELECT lower(u.email) FROM users u WHERE u.id=$2 AND u.is_active AND (SELECT count(*) FROM users other WHERE lower(other.email)=lower(u.email) AND other.is_active)=1))`, id, actor).Scan(&ticketID, &sender, &recipient, &recipientEmail, &initialStatus)
	if err != nil {
		return err
	}
	if req.Status == "cancelled" && actor != sender || req.Status != "cancelled" && (actor == sender || recipient.Valid && actor != recipient) {
		return missing()
	}
	if initialStatus == req.Status {
		router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
		return nil
	}
	if req.Status != "accepted" {
		result, e := tx.Exec(r.Context(), `UPDATE ticket_transfers SET status=$2::text,responded_at=CURRENT_TIMESTAMP,recipient_id=CASE WHEN $2::text='declined' THEN $3 ELSE recipient_id END WHERE id=$1 AND status='pending'`, id, req.Status, actor)
		if e != nil {
			return e
		}
		if result.RowsAffected() != 1 {
			return conflict("TRANSFER_CLOSED")
		}
		if e = tx.Commit(r.Context()); e != nil {
			return e
		}
		router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
		return nil
	}
	if err = lockActiveUsers(r.Context(), tx, []pgtype.UUID{sender, actor}); err != nil {
		return err
	}
	t, err := lockTransferTicket(r.Context(), tx, ticketID, true)
	if err != nil {
		return err
	}
	var status string
	var expires time.Time
	if err = tx.QueryRow(r.Context(), `SELECT status,expires_at FROM ticket_transfers WHERE id=$1 FOR UPDATE`, id).Scan(&status, &expires); err != nil {
		return err
	}
	if status == req.Status {
		router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
		return nil
	}
	if status != "pending" {
		return conflict("TRANSFER_CLOSED")
	}
	if req.Status == "accepted" {
		if !time.Now().Before(expires) {
			return conflict("TRANSFER_CLOSED")
		}
		if err = t.eligible(sender, time.Now()); err != nil {
			return err
		}
		var active bool
		if err = tx.QueryRow(r.Context(), `SELECT is_active AND lower(email)=$2 AND (SELECT count(*) FROM users WHERE lower(email)=$2 AND is_active)=1 FROM users WHERE id=$1 FOR SHARE`, actor, recipientEmail).Scan(&active); err != nil {
			return err
		}
		if !active {
			return conflict("RECIPIENT_UNAVAILABLE")
		}
		recipient = actor
		var secret [32]byte
		if _, err = rand.Read(secret[:]); err != nil {
			return err
		}
		if _, err = tx.Exec(r.Context(), `UPDATE tickets SET user_id=$2,validation_hash=$3,validation_generation=validation_generation+1 WHERE id=$1`, ticketID, recipient, hex.EncodeToString(secret[:])); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(r.Context(), `UPDATE ticket_transfers SET status=$2::text,responded_at=CURRENT_TIMESTAMP,recipient_id=CASE WHEN $2::text='cancelled' THEN recipient_id ELSE $3 END WHERE id=$1`, id, req.Status, actor); err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
	return nil
}
