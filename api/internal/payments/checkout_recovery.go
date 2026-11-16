package payments

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
)

type RecoverCheckoutRequest struct {
	OrderID string `json:"orderId"`
	EventID string `json:"eventId"`
	Action  string `json:"action,omitempty"`
}

type RecoverCheckoutResponse struct {
	Status           string `json:"status"`
	OrderID          string `json:"orderId"`
	PaymentAttempted bool   `json:"paymentAttempted"`
	Checkout         any    `json:"checkout,omitempty"`
	RecoveryReason   string `json:"recoveryReason,omitempty"`
}

// Recovery is authenticated and bound to the original purchaser and event.
// It never creates another order, changes recipients, or turns an untouched
// checkout into a submitted payment. Guest capability routes remain separate.
func (h *CheckoutHandler) HandleRecoverCheckout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	actorString, authErr := auth.GetUserIDFromContext(r.Context())
	var actor, orderID, eventID pgtype.UUID
	if authErr != nil || actor.Scan(actorString) != nil || !actor.Valid {
		router.RespondWithError(w, http.StatusUnauthorized, "Autentificare necesara")
		return
	}
	var input RecoverCheckoutRequest
	if !router.DecodeJSON(w, r, &input, 2048) {
		return
	}
	if orderID.Scan(input.OrderID) != nil || !orderID.Valid || eventID.Scan(input.EventID) != nil || !eventID.Valid || input.Action != "" && input.Action != "check" && input.Action != "cancel" {
		router.RespondWithError(w, http.StatusBadRequest, "Datele checkoutului sunt invalide")
		return
	}
	var owned bool
	if err := h.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM orders o JOIN users u ON u.id=o.user_id AND u.is_active WHERE o.id=$1 AND o.event_id=$2 AND o.user_id=$3 AND o.account_owner_deleted_at IS NULL)`, orderID, eventID, actor).Scan(&owned); err != nil {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Checkoutul nu a putut fi verificat")
		return
	}
	if !owned {
		router.RespondWithError(w, http.StatusNotFound, "Checkoutul nu a fost gasit")
		return
	}
	order, err := h.queries.GetOrderForUpdate(r.Context(), orderID)
	if err != nil {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Checkoutul nu a putut fi verificat")
		return
	}
	response := RecoverCheckoutResponse{Status: string(order.Status), OrderID: common.UUIDToString(orderID)}
	var closed bool
	if err = h.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM checkout_payment_attempts WHERE order_id=$1),EXISTS(SELECT 1 FROM checkout_closed_payments WHERE order_id=$1)`, orderID).Scan(&response.PaymentAttempted, &closed); err != nil {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Checkoutul nu a putut fi verificat")
		return
	}
	if order.Status == db.OrderStatusCompleted || order.Status == db.OrderStatusRefunded {
		response.PaymentAttempted = true
		router.RespondWithJSON(w, http.StatusOK, response)
		return
	}
	if closed {
		response.Status = "failed"
		router.RespondWithJSON(w, http.StatusOK, response)
		return
	}
	if !h.configured {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Platile nu sunt configurate")
		return
	}
	var checkout any
	cancel := input.Action == "cancel"
	if order.StripeCheckoutSessionID.Valid && order.StripeCheckoutSessionID.String != "" {
		response.Status, _, err = h.reconcileCheckoutSession(r.Context(), order.StripeCheckoutSessionID.String, input.EventID)
		if err == nil && response.Status == "pending" {
			var session *stripe.CheckoutSession
			session, err = h.retrieveCheckoutSession(r.Context(), order.StripeCheckoutSessionID.String, order.StripeConnectedAccountID.String)
			if err == nil && !h.recoverySessionMatches(order, session) {
				err = errors.New("checkout session binding mismatch")
			}
			if err == nil && cancel && session.Status == stripe.CheckoutSessionStatusOpen {
				if h.client == nil {
					err = errors.New("checkout client unavailable")
				} else {
					params := &stripe.CheckoutSessionExpireParams{}
					params.SetStripeAccount(order.StripeConnectedAccountID.String)
					// A successful payment can race expiry. Re-read the provider;
					// never infer that a failed expiry released this reservation.
					_, _ = h.client.V1CheckoutSessions.Expire(r.Context(), session.ID, params)
					response.Status, _, err = h.reconcileCheckoutSession(r.Context(), session.ID, input.EventID)
				}
			}
			if err == nil && !cancel && session.Status == stripe.CheckoutSessionStatusOpen {
				parsed, parseErr := url.Parse(session.URL)
				if parseErr != nil || parsed.Scheme != "https" || parsed.Hostname() != "checkout.stripe.com" || parsed.Port() != "" || parsed.User != nil {
					err = errors.New("invalid Stripe Checkout URL")
				} else {
					checkout = CreateCheckoutResponse{CheckoutURL: session.URL, OrderID: input.OrderID, SessionID: session.ID}
				}
			}
		}
	} else if order.StripePaymentIntentID.Valid && order.StripePaymentIntentID.String != "" {
		if h.client == nil {
			router.RespondWithError(w, http.StatusServiceUnavailable, "Platile nu sunt configurate")
			return
		}
		var expires time.Time
		var intent *stripe.PaymentIntent
		order, expires, err = h.nativePaymentOrder(r.Context(), orderID)
		if err == nil {
			intent, err = h.retrieveNativePaymentIntent(r.Context(), order.StripePaymentIntentID.String, order.StripeConnectedAccountID.String)
		}
		if err == nil {
			response.Status, err = h.reconcileNativePaymentIntent(r.Context(), order, intent, expires, cancel)
		}
		if err == nil && !cancel && response.Status == "pending" && time.Now().Before(expires) &&
			(intent.Status == stripe.PaymentIntentStatusRequiresPaymentMethod || intent.Status == stripe.PaymentIntentStatusRequiresConfirmation || intent.Status == stripe.PaymentIntentStatusRequiresAction) {
			if !h.nativePaymentSheetConfigured() || intent.ClientSecret == "" {
				err = errors.New("native checkout unavailable")
			} else {
				checkout = NativePaymentSheetResponse{Mode: "payment_sheet", OrderID: input.OrderID, PaymentIntentID: intent.ID, PaymentIntentClientSecret: intent.ClientSecret, StripeAccountID: order.StripeConnectedAccountID.String, PublishableKey: h.publishableKey, ExpiresAt: expires.UTC().Format(time.RFC3339)}
			}
		}
	} else if order.Status == db.OrderStatusFailed {
		response.Status = "failed"
	} else {
		// Preparation may still own its Stripe idempotency request. Do not
		// manufacture another payment or release inventory behind its back.
		w.Header().Set("Retry-After", "3")
		router.RespondWithError(w, http.StatusTooEarly, "Checkoutul este in curs de pregatire. Reincearca in cateva secunde.")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusBadGateway, "Checkoutul nu a putut fi verificat. Reincearca.")
		return
	}
	if err = h.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM checkout_payment_attempts WHERE order_id=$1)`, orderID).Scan(&response.PaymentAttempted); err != nil {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Checkoutul nu a putut fi verificat")
		return
	}
	if response.Status == "completed" || response.Status == "refunded" {
		response.PaymentAttempted = true
	}
	if checkout != nil && response.Status == "pending" {
		response.RecoveryReason, err = h.checkoutRecoverySelectionReason(r.Context(), order)
		if err != nil {
			router.RespondWithError(w, http.StatusServiceUnavailable, "Selectia nu a putut fi verificata")
			return
		}
		if response.RecoveryReason == "" {
			response.Checkout = checkout
		}
	}
	router.RespondWithJSON(w, http.StatusOK, response)
}

func (h *CheckoutHandler) recoverySessionMatches(order db.Orders, session *stripe.CheckoutSession) bool {
	return session != nil && session.ID == order.StripeCheckoutSessionID.String && h.acceptsStripeLiveMode(session.Livemode) &&
		session.Mode == stripe.CheckoutSessionModePayment && session.Currency == stripe.CurrencyRON && session.AmountTotal == int64(order.TotalAmount)*100+int64(order.CustomerTicketingFeeBani) &&
		(!order.StripeLivemode.Valid || order.StripeLivemode.Bool == session.Livemode) &&
		firstStripeMetadata(session.Metadata, "spottr_order_id", "pulse_order_id") == common.UUIDToString(order.ID)
}

// Keep recovery scoped to the stored recipients and decision, never the new UI
// selection. Reconciliation/cancellation remain possible after a group change.
func (h *CheckoutHandler) checkoutRecoverySelectionReason(ctx context.Context, order db.Orders) (string, error) {
	var changed, denied bool
	err := h.db.QueryRow(ctx, `SELECT
 EXISTS(SELECT 1 FROM outing_ticket_recipients a LEFT JOIN outing_plans p ON p.id=a.plan_id
  WHERE a.order_id=$1 AND a.plan_id IS NOT NULL AND (p.id IS NULL OR p.chosen_event_id IS DISTINCT FROM a.event_id OR p.decision_round<>a.decision_round OR p.expires_at<=CURRENT_TIMESTAMP)),
 NOT EXISTS(SELECT 1 FROM events e WHERE e.id=$3 AND e.status='published' AND e.end_time>CURRENT_TIMESTAMP) OR
 EXISTS(SELECT 1 FROM outing_ticket_recipients a LEFT JOIN users recipient ON recipient.id=a.recipient_id
  JOIN events e ON e.id=a.event_id WHERE a.order_id=$1 AND (NOT COALESCE(recipient.is_active,FALSE) OR e.status<>'published' OR e.end_time<=CURRENT_TIMESTAMP OR
   (a.recipient_id<>$2 AND (e.ticket_transfers_locked OR e.start_time<=CURRENT_TIMESTAMP)) OR
   (a.plan_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM outing_plans p JOIN friend_group_members gm ON gm.group_id=p.group_id AND gm.status='accepted'
      JOIN outing_plan_members pm ON pm.plan_id=p.id AND pm.user_id=gm.user_id AND pm.status='accepted' WHERE p.id=a.plan_id AND gm.user_id=$2)
      OR NOT EXISTS(SELECT 1 FROM outing_plans p JOIN friend_group_members gm ON gm.group_id=p.group_id AND gm.status='accepted'
      JOIN outing_plan_members pm ON pm.plan_id=p.id AND pm.user_id=gm.user_id AND pm.status='accepted' WHERE p.id=a.plan_id AND gm.user_id=a.recipient_id))) OR
   (a.plan_id IS NULL AND a.recipient_id<>$2 AND NOT EXISTS(SELECT 1 FROM friendships f WHERE f.status='accepted' AND
     ((f.user_id=$2 AND f.friend_id=a.recipient_id) OR (f.friend_id=$2 AND f.user_id=a.recipient_id))))))`, order.ID, order.UserID, order.EventID).Scan(&changed, &denied)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	if changed {
		return "outing_changed", nil
	}
	if denied {
		return "review_recipients", nil
	}
	return "", nil
}
