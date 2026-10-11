package payments

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
	"net/http"
	"pulse-api/internal/common"
	"pulse-api/internal/router"
	"strings"
	"time"
)

type checkoutRequestContextKey struct{}

// Claim before reserving, bind the order IN the inventory transaction. Never
// take over a request with an unknown external outcome and create another order.
func (h *CheckoutHandler) claimCheckoutRequest(ctx context.Context, key pgtype.UUID, subject string, payload []byte) (pgtype.UUID, bool, error) {
	subjectHash, requestHash := sha256.Sum256([]byte(subject)), sha256.Sum256(payload)
	var id pgtype.UUID
	err := h.db.QueryRow(ctx, `INSERT INTO checkout_requests(subject_hash,request_key,request_hash) VALUES($1,$2,$3)
ON CONFLICT(subject_hash,request_key) DO UPDATE SET id=gen_random_uuid(),created_at=clock_timestamp()
WHERE checkout_requests.order_id IS NULL AND checkout_requests.response IS NULL
  AND checkout_requests.created_at < clock_timestamp()-interval '2 minutes'
  AND checkout_requests.request_hash=EXCLUDED.request_hash
RETURNING id`, subjectHash[:], key, requestHash[:]).Scan(&id)
	if err == nil {
		return id, true, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return id, false, err
	}
	var stored []byte
	err = h.db.QueryRow(ctx, `SELECT id,request_hash FROM checkout_requests WHERE subject_hash=$1 AND request_key=$2`, subjectHash[:], key).Scan(&id, &stored)
	if err != nil {
		return id, false, err
	}
	if !bytes.Equal(stored, requestHash[:]) {
		return id, false, &checkoutRequestError{http.StatusConflict, "Cererea de plata a fost schimbata. Reincearca."}
	}
	return id, false, nil
}

func (h *CheckoutHandler) beginCheckoutRequest(w http.ResponseWriter, r *http.Request, eventID, userID pgtype.UUID, req CreateCheckoutRequest) (*http.Request, pgtype.UUID, bool) {
	raw := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if raw == "" {
		return r, pgtype.UUID{}, true
	} // Older app versions remain compatible.
	var key pgtype.UUID
	if key.Scan(raw) != nil || !key.Valid {
		router.RespondWithError(w, 400, "Cheia cererii este invalida")
		return r, key, false
	}
	subject := "guest:" + strings.ToLower(req.Email)
	if userID.Valid {
		subject = "user:" + common.UUIDToString(userID)
	}
	payload, _ := json.Marshal(struct {
		EventID pgtype.UUID
		Request CreateCheckoutRequest
	}{eventID, req})
	id, claimed, err := h.claimCheckoutRequest(r.Context(), key, subject, payload)
	if err != nil {
		var invalid *checkoutRequestError
		if errors.As(err, &invalid) {
			router.RespondWithError(w, invalid.status, invalid.message)
		} else {
			router.RespondWithError(w, 503, "Cererea nu a putut fi verificata. Reincearca.")
		}
		return r, id, false
	}
	if !claimed {
		h.replayCheckoutRequest(w, r, id, req.Client, req.ReturnOrigin)
		return r, id, false
	}
	return r.WithContext(context.WithValue(r.Context(), checkoutRequestContextKey{}, id)), id, true
}

func (h *CheckoutHandler) replayCheckoutRequest(w http.ResponseWriter, r *http.Request, id pgtype.UUID, client string, origins ...string) {
	if client == checkoutClientNativeSheet {
		h.replayNativePaymentSheet(w, r, id)
		return
	}
	var response []byte
	var orderID pgtype.UUID
	var storedSessionID pgtype.Text
	var created time.Time
	if err := h.db.QueryRow(r.Context(), `SELECT cr.response,cr.order_id,cr.created_at,o.stripe_checkout_session_id
FROM checkout_requests cr LEFT JOIN orders o ON o.id=cr.order_id WHERE cr.id=$1`, id).Scan(&response, &orderID, &created, &storedSessionID); err != nil {
		router.RespondWithError(w, 503, "Cererea nu a putut fi verificata")
		return
	}
	if len(response) > 0 && time.Since(created) < 20*time.Minute {
		var result CreateCheckoutResponse
		if json.Unmarshal(response, &result) == nil {
			// Responses saved by older versions did not include the Session ID.
			if result.SessionID == "" && storedSessionID.Valid {
				result.SessionID = storedSessionID.String
			}
			if result.SessionID != "" {
				router.RespondWithJSON(w, http.StatusCreated, result)
				return
			}
		}
	}
	if orderID.Valid {
		var sessionID, accountID pgtype.Text
		var eventID pgtype.UUID
		var status string
		err := h.db.QueryRow(r.Context(), `SELECT stripe_checkout_session_id,stripe_connected_account_id,event_id,status::text FROM orders WHERE id=$1`, orderID).Scan(&sessionID, &accountID, &eventID, &status)
		if err == nil && sessionID.Valid && accountID.Valid {
			session, err := h.retrieveCheckoutSession(r.Context(), sessionID.String, accountID.String)
			if err == nil && session != nil {
				url := session.URL
				if session.Status == stripe.CheckoutSessionStatusComplete {
					url = h.checkoutSuccessURL(client, common.UUIDToString(eventID), session.ID, origins...)
				} else if session.Status == stripe.CheckoutSessionStatusExpired {
					router.RespondWithError(w, http.StatusConflict, "Sesiunea de plata a expirat. Reincearca.")
					return
				}
				if url != "" {
					router.RespondWithJSON(w, http.StatusCreated, CreateCheckoutResponse{CheckoutURL: url, OrderID: common.UUIDToString(orderID), SessionID: session.ID})
					return
				}
			}
		} else if err == nil && status == "failed" {
			router.RespondWithError(w, http.StatusConflict, "Sesiunea de plata nu a fost creata. Reincearca.")
			return
		}
	}
	w.Header().Set("Retry-After", "3")
	router.RespondWithError(w, http.StatusTooEarly, "Plata este in curs de pregatire sau verificare. Reincearca in cateva secunde.")
}

func (h *CheckoutHandler) releaseUnreservedRequest(id pgtype.UUID) {
	if !id.Valid {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	// An order link survives every HTTP/Stripe timeout; only a rolled-back
	// reservation can be retried as a new operation with this key.
	_, _ = h.db.Exec(ctx, `DELETE FROM checkout_requests WHERE id=$1 AND order_id IS NULL`, id)
}

func (h *CheckoutHandler) persistCheckoutResponse(id pgtype.UUID, response CreateCheckoutResponse) {
	if !id.Valid {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	payload, _ := json.Marshal(response)
	// If this write fails, replay recovers the already-bound Stripe Session.
	_, _ = h.db.Exec(ctx, `UPDATE checkout_requests SET response=$2 WHERE id=$1 AND order_id IS NOT NULL`, id, payload)
}
