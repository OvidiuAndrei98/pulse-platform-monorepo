package payments

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
)

const refundWorkerBatchSize = int32(25)

type CancellationRequestResponse struct {
	ID                  string `json:"id"`
	EventID             string `json:"eventId"`
	OrganizerID         string `json:"organizerId"`
	EventTitle          string `json:"eventTitle,omitempty"`
	OrganizerEmail      string `json:"organizerEmail,omitempty"`
	CompanyName         string `json:"companyName,omitempty"`
	PreviousEventStatus string `json:"previousEventStatus"`
	Reason              string `json:"reason"`
	EvidenceURL         string `json:"evidenceUrl,omitempty"`
	Status              string `json:"status"`
	FeePolicy           string `json:"feePolicy,omitempty"`
	AdminNote           string `json:"adminNote,omitempty"`
	StartTime           string `json:"startTime,omitempty"`
	OrderCount          int64  `json:"orderCount,omitempty"`
	TicketCount         int64  `json:"ticketCount,omitempty"`
	CustomerTotalBani   int64  `json:"customerTotalBani,omitempty"`
	PlatformFeeBani     int64  `json:"platformFeeBani,omitempty"`
	AlreadyRefundedBani int64  `json:"alreadyRefundedBani,omitempty"`
	SucceededRefunds    int64  `json:"succeededRefunds,omitempty"`
	PendingRefunds      int64  `json:"pendingRefunds,omitempty"`
	FailedRefunds       int64  `json:"failedRefunds,omitempty"`
	CreatedAt           string `json:"createdAt"`
	UpdatedAt           string `json:"updatedAt"`
}

type RefundAttentionResponse struct {
	OrderID             string `json:"orderId"`
	EventID             string `json:"eventId"`
	EventTitle          string `json:"eventTitle"`
	OrganizerID         string `json:"organizerId"`
	OrganizerEmail      string `json:"organizerEmail,omitempty"`
	CompanyName         string `json:"companyName,omitempty"`
	BuyerEmail          string `json:"buyerEmail"`
	CustomerTotalBani   int64  `json:"customerTotalBani"`
	RefundedAmountBani  int64  `json:"refundedAmountBani"`
	RemainingAmountBani int64  `json:"remainingAmountBani"`
	PlatformFeeBani     int64  `json:"platformFeeBani"`
	PlatformFeeStatus   string `json:"platformFeeStatus"`
	StripeRefundStatus  string `json:"stripeRefundStatus"`
	RefundOrigin        string `json:"refundOrigin"`
	OperationStatus     string `json:"operationStatus"`
	ErrorMessage        string `json:"errorMessage,omitempty"`
	TicketCount         int64  `json:"ticketCount"`
	StripeLivemode      bool   `json:"stripeLivemode"`
	PurchasedAt         string `json:"purchasedAt"`
	UpdatedAt           string `json:"updatedAt"`
}

type RefundReconciliationResponse struct {
	RequiresAttention  bool   `json:"requiresAttention"`
	RefundStatus       string `json:"refundStatus"`
	RefundedAmountBani int64  `json:"refundedAmountBani"`
	CustomerTotalBani  int64  `json:"customerTotalBani"`
}

type createCancellationRequest struct {
	Reason      string `json:"reason"`
	EvidenceURL string `json:"evidenceUrl"`
}

type reviewCancellationRequest struct {
	FeePolicy string `json:"feePolicy"`
	AdminNote string `json:"adminNote"`
}

func (h *CheckoutHandler) HandleCreateEventCancellationRequest(w http.ResponseWriter, r *http.Request) {
	organizerID, ok := authenticatedUUID(w, r)
	if !ok {
		return
	}
	eventID, ok := pathUUID(w, r, "id", "ID-ul evenimentului este invalid")
	if !ok {
		return
	}

	var request createCancellationRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Datele cererii sunt invalide")
		return
	}
	request.Reason = strings.TrimSpace(request.Reason)
	request.EvidenceURL = strings.TrimSpace(request.EvidenceURL)
	if len(request.Reason) < 10 || len(request.Reason) > 4000 {
		router.RespondWithError(w, http.StatusBadRequest, "Motivul anularii trebuie sa aiba intre 10 si 4000 de caractere")
		return
	}
	if request.EvidenceURL != "" {
		parsed, err := url.ParseRequestURI(request.EvidenceURL)
		if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") {
			router.RespondWithError(w, http.StatusBadRequest, "Linkul documentului justificativ este invalid")
			return
		}
	}

	_, err := h.queries.CreateEventCancellationRequest(r.Context(), db.CreateEventCancellationRequestParams{
		EventID:     eventID,
		OrganizerID: organizerID,
		Reason:      request.Reason,
		EvidenceUrl: optionalText(request.EvidenceURL),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusConflict, "Doar un eveniment publicat sau programat poate fi trimis spre anulare")
		return
	}
	if err != nil {
		if strings.Contains(err.Error(), "event_cancellation_requests_active_idx") {
			router.RespondWithError(w, http.StatusConflict, "Exista deja o cerere activa pentru acest eveniment")
			return
		}
		log.Printf("create event cancellation request failed: event=%s err=%v", common.UUIDToString(eventID), err)
		router.RespondWithError(w, http.StatusInternalServerError, "Cererea de anulare nu a putut fi salvata")
		return
	}
	response, err := h.queries.GetOrganizerEventCancellationRequest(r.Context(), db.GetOrganizerEventCancellationRequestParams{EventID: eventID, OrganizerID: organizerID})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Cererea de anulare nu a putut fi reincarcata")
		return
	}
	router.RespondWithJSON(w, http.StatusCreated, mapCancellationRequest(response))
}

func (h *CheckoutHandler) HandleGetEventCancellationRequest(w http.ResponseWriter, r *http.Request) {
	organizerID, ok := authenticatedUUID(w, r)
	if !ok {
		return
	}
	eventID, ok := pathUUID(w, r, "id", "ID-ul evenimentului este invalid")
	if !ok {
		return
	}
	request, err := h.queries.GetOrganizerEventCancellationRequest(r.Context(), db.GetOrganizerEventCancellationRequestParams{EventID: eventID, OrganizerID: organizerID})
	if errors.Is(err, pgx.ErrNoRows) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Cererea de anulare nu a putut fi incarcata")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, mapCancellationRequest(request))
}

func (h *CheckoutHandler) HandleListOrganizerRefundsRequiringAttention(w http.ResponseWriter, r *http.Request) {
	organizerID, ok := authenticatedUUID(w, r)
	if !ok {
		return
	}
	rows, err := h.queries.ListOrganizerRefundsRequiringAttention(r.Context(), organizerID)
	if err != nil {
		log.Printf("list organizer refund attention failed: organizer=%s err=%v", common.UUIDToString(organizerID), err)
		router.RespondWithError(w, http.StatusInternalServerError, "Refundurile care necesita atentie nu au putut fi incarcate")
		return
	}
	result := make([]RefundAttentionResponse, 0, len(rows))
	for _, row := range rows {
		result = append(result, RefundAttentionResponse{
			OrderID: common.UUIDToString(row.OrderID), EventID: common.UUIDToString(row.EventID),
			EventTitle: row.EventTitle, OrganizerID: common.UUIDToString(row.OrganizerID), BuyerEmail: row.BuyerEmail,
			CustomerTotalBani: row.CustomerTotalBani, RefundedAmountBani: row.RefundedAmountBani,
			RemainingAmountBani: row.RemainingAmountBani, PlatformFeeBani: row.PlatformFeeBani,
			PlatformFeeStatus: row.PlatformFeeStatus, StripeRefundStatus: row.StripeRefundStatus,
			RefundOrigin: row.RefundOrigin, OperationStatus: row.OperationStatus, ErrorMessage: row.ErrorMessage.String,
			TicketCount: row.TicketCount, StripeLivemode: row.StripeLivemode,
			PurchasedAt: common.TimestampToString(row.PurchasedAt), UpdatedAt: common.TimestampToString(row.UpdatedAt),
		})
	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

func (h *CheckoutHandler) HandleAdminListRefundsRequiringAttention(w http.ResponseWriter, r *http.Request) {
	rows, err := h.queries.ListAdminRefundsRequiringAttention(r.Context())
	if err != nil {
		log.Printf("list admin refund attention failed: %v", err)
		router.RespondWithError(w, http.StatusInternalServerError, "Refundurile care necesita atentie nu au putut fi incarcate")
		return
	}
	result := make([]RefundAttentionResponse, 0, len(rows))
	for _, row := range rows {
		result = append(result, RefundAttentionResponse{
			OrderID: common.UUIDToString(row.OrderID), EventID: common.UUIDToString(row.EventID),
			EventTitle: row.EventTitle, OrganizerID: common.UUIDToString(row.OrganizerID),
			OrganizerEmail: row.OrganizerEmail, CompanyName: row.CompanyName, BuyerEmail: row.BuyerEmail,
			CustomerTotalBani: row.CustomerTotalBani, RefundedAmountBani: row.RefundedAmountBani,
			RemainingAmountBani: row.RemainingAmountBani, PlatformFeeBani: row.PlatformFeeBani,
			PlatformFeeStatus: row.PlatformFeeStatus, StripeRefundStatus: row.StripeRefundStatus,
			RefundOrigin: row.RefundOrigin, OperationStatus: row.OperationStatus, ErrorMessage: row.ErrorMessage.String,
			TicketCount: row.TicketCount, StripeLivemode: row.StripeLivemode,
			PurchasedAt: common.TimestampToString(row.PurchasedAt), UpdatedAt: common.TimestampToString(row.UpdatedAt),
		})
	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

func (h *CheckoutHandler) HandleReconcileOrganizerRefundAttention(w http.ResponseWriter, r *http.Request) {
	organizerID, ok := authenticatedUUID(w, r)
	if !ok {
		return
	}
	orderID, ok := pathUUID(w, r, "id", "ID-ul comenzii este invalid")
	if !ok {
		return
	}
	order, err := h.queries.GetOrganizerRefundAttentionOrder(r.Context(), db.GetOrganizerRefundAttentionOrderParams{
		OrderID: orderID, OrganizerID: organizerID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusNotFound, "Comanda nu mai necesita verificare sau nu apartine organizatorului")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Comanda nu a putut fi incarcata")
		return
	}
	h.reconcileRefundAttention(w, r, order)
}

func (h *CheckoutHandler) HandleAdminReconcileRefundAttention(w http.ResponseWriter, r *http.Request) {
	orderID, ok := pathUUID(w, r, "id", "ID-ul comenzii este invalid")
	if !ok {
		return
	}
	order, err := h.queries.GetAdminRefundAttentionOrder(r.Context(), orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusNotFound, "Comanda nu mai necesita verificare")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Comanda nu a putut fi incarcata")
		return
	}
	h.reconcileRefundAttention(w, r, order)
}

func (h *CheckoutHandler) reconcileRefundAttention(w http.ResponseWriter, r *http.Request, order db.Orders) {
	charge, connectedAccountID, err := h.retrieveOrderCharge(r.Context(), order)
	if err != nil {
		log.Printf("refund attention Stripe refresh failed: order=%s err=%v", common.UUIDToString(order.ID), err)
		router.RespondWithError(w, http.StatusBadGateway, "Statusul refundului nu a putut fi verificat in Stripe")
		return
	}
	fullRefund := stripeChargeFullyRefunded(*charge)
	status := order.StripeRefundStatus
	if status == "" {
		status = "none"
	}
	if charge.AmountRefunded > 0 || fullRefund {
		status = "partial"
		if err := h.ReconcileChargeRefund(r.Context(), *charge, connectedAccountID, charge.Livemode); err != nil {
			log.Printf("refund attention reconciliation failed: order=%s charge=%s err=%v", common.UUIDToString(order.ID), charge.ID, err)
			router.RespondWithError(w, http.StatusInternalServerError, "Statusul refundului nu a putut fi reconciliat")
			return
		}
	}
	if fullRefund {
		status = "succeeded"
	}
	router.RespondWithJSON(w, http.StatusOK, RefundReconciliationResponse{
		RequiresAttention: !fullRefund, RefundStatus: status,
		RefundedAmountBani: charge.AmountRefunded, CustomerTotalBani: charge.Amount,
	})
}

func (h *CheckoutHandler) retrieveOrderCharge(ctx context.Context, order db.Orders) (*stripe.Charge, string, error) {
	connectedAccountID := ""
	if order.StripeChargeType.String == directChargeType && order.StripeConnectedAccountID.Valid {
		connectedAccountID = order.StripeConnectedAccountID.String
	}
	chargeID := order.StripeChargeID.String
	if chargeID == "" && order.StripePaymentIntentID.Valid {
		params := &stripe.PaymentIntentRetrieveParams{}
		if connectedAccountID != "" {
			params.SetStripeAccount(connectedAccountID)
		}
		intent, err := h.client.V1PaymentIntents.Retrieve(ctx, order.StripePaymentIntentID.String, params)
		if err != nil {
			return nil, connectedAccountID, err
		}
		if intent.LatestCharge != nil {
			chargeID = intent.LatestCharge.ID
		}
	}
	if chargeID == "" {
		return nil, connectedAccountID, errors.New("charge-ul Stripe al comenzii nu poate fi identificat")
	}
	params := &stripe.ChargeRetrieveParams{}
	if connectedAccountID != "" {
		params.SetStripeAccount(connectedAccountID)
	}
	charge, err := h.client.V1Charges.Retrieve(ctx, chargeID, params)
	return charge, connectedAccountID, err
}

func (h *CheckoutHandler) HandleAdminListEventCancellationRequests(w http.ResponseWriter, r *http.Request) {
	rows, err := h.queries.ListAdminEventCancellationRequests(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Cererile de anulare nu au putut fi incarcate")
		return
	}
	result := make([]CancellationRequestResponse, 0, len(rows))
	for _, row := range rows {
		result = append(result, CancellationRequestResponse{
			ID: common.UUIDToString(row.ID), EventID: common.UUIDToString(row.EventID), OrganizerID: common.UUIDToString(row.OrganizerID),
			EventTitle: row.EventTitle, OrganizerEmail: row.OrganizerEmail, CompanyName: row.CompanyName,
			PreviousEventStatus: row.PreviousEventStatus, Reason: row.Reason, EvidenceURL: row.EvidenceUrl.String,
			Status: row.Status, FeePolicy: row.FeePolicy.String, AdminNote: row.AdminNote.String,
			StartTime: common.TimestampToString(row.StartTime), OrderCount: row.OrderCount, TicketCount: row.TicketCount,
			CustomerTotalBani: row.CustomerTotalBani, PlatformFeeBani: row.PlatformFeeBani,
			AlreadyRefundedBani: row.AlreadyRefundedBani, SucceededRefunds: row.SucceededRefunds,
			PendingRefunds: row.PendingRefunds, FailedRefunds: row.FailedRefunds,
			CreatedAt: common.TimestampToString(row.CreatedAt), UpdatedAt: common.TimestampToString(row.UpdatedAt),
		})
	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

func (h *CheckoutHandler) HandleAdminApproveEventCancellation(w http.ResponseWriter, r *http.Request) {
	adminID, ok := authenticatedUUID(w, r)
	if !ok {
		return
	}
	requestID, ok := pathUUID(w, r, "id", "ID-ul cererii este invalid")
	if !ok {
		return
	}
	var request reviewCancellationRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Datele aprobarii sunt invalide")
		return
	}
	if request.FeePolicy != "retain" && request.FeePolicy != "refund" {
		router.RespondWithError(w, http.StatusBadRequest, "Politica taxei trebuie sa fie retain sau refund")
		return
	}
	_, err := h.queries.ApproveEventCancellation(r.Context(), db.ApproveEventCancellationParams{
		ID: requestID, ReviewedBy: adminID, FeePolicy: optionalText(request.FeePolicy), AdminNote: optionalText(strings.TrimSpace(request.AdminNote)),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusConflict, "Cererea nu mai este in asteptare")
		return
	}
	if err != nil {
		log.Printf("approve event cancellation failed: request=%s err=%v", common.UUIDToString(requestID), err)
		router.RespondWithError(w, http.StatusInternalServerError, "Anularea nu a putut fi aprobata")
		return
	}
	// The durable worker owns the Stripe calls. Triggering a pass here reduces
	// latency without making the HTTP request depend on thousands of refunds.
	go h.processRefundBatch(context.Background())
	router.RespondWithJSON(w, http.StatusAccepted, map[string]string{"status": "refunding"})
}

func (h *CheckoutHandler) HandleAdminRejectEventCancellation(w http.ResponseWriter, r *http.Request) {
	adminID, ok := authenticatedUUID(w, r)
	if !ok {
		return
	}
	requestID, ok := pathUUID(w, r, "id", "ID-ul cererii este invalid")
	if !ok {
		return
	}
	var request reviewCancellationRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	_, err := h.queries.RejectEventCancellation(r.Context(), db.RejectEventCancellationParams{ID: requestID, ReviewedBy: adminID, AdminNote: optionalText(strings.TrimSpace(request.AdminNote))})
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusConflict, "Cererea nu mai este in asteptare")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Cererea nu a putut fi respinsa")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *CheckoutHandler) HandleAdminRetryEventCancellation(w http.ResponseWriter, r *http.Request) {
	requestID, ok := pathUUID(w, r, "id", "ID-ul cererii este invalid")
	if !ok {
		return
	}
	count, err := h.queries.RetryEventCancellationRefunds(r.Context(), requestID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Refundurile nu au putut fi repornite")
		return
	}
	if count == 0 {
		router.RespondWithError(w, http.StatusConflict, "Cererea nu are refunduri care pot fi reincercate")
		return
	}
	go h.processRefundBatch(context.Background())
	router.RespondWithJSON(w, http.StatusAccepted, map[string]string{"status": "refunding"})
}

func (h *CheckoutHandler) StartRefundWorker(ctx context.Context) {
	if h == nil || !h.configured {
		return
	}
	go func() {
		h.processRefundBatch(ctx)
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.processRefundBatch(ctx)
			}
		}
	}()
}

func (h *CheckoutHandler) processRefundBatch(ctx context.Context) {
	if h == nil || h.queries == nil || h.client == nil {
		return
	}
	operations, err := h.queries.ClaimOrderRefundOperations(ctx, refundWorkerBatchSize)
	if err != nil {
		log.Printf("refund worker claim failed: %v", err)
		return
	}
	var waitGroup sync.WaitGroup
	concurrency := make(chan struct{}, 5)
	for _, operation := range operations {
		operation := operation
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			concurrency <- struct{}{}
			defer func() { <-concurrency }()
			operationCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()
			if err := h.processRefundOperation(operationCtx, operation.ID); err != nil {
				log.Printf("refund operation failed: operation=%s err=%v", common.UUIDToString(operation.ID), err)
			}
		}()
	}
	waitGroup.Wait()
	if _, err := h.queries.FinalizeEmptyCancellationRequests(ctx); err != nil {
		log.Printf("empty cancellation finalization failed: %v", err)
	}
	if _, err := h.queries.FinalizeCompletedCancellationRequests(ctx); err != nil {
		log.Printf("cancellation finalization failed: %v", err)
	}
}

func (h *CheckoutHandler) processRefundOperation(ctx context.Context, operationID pgtype.UUID) error {
	data, err := h.queries.GetOrderRefundExecutionData(ctx, operationID)
	if err != nil {
		return err
	}
	if data.StripeLivemode.Valid && !h.acceptsStripeLiveMode(data.StripeLivemode.Bool) {
		return h.failRefundOperation(ctx, data, errors.New("mediul Stripe al comenzii nu corespunde cheii configurate"), true)
	}

	if data.OrderStatus == db.OrderStatusRefunded || data.Source == "stripe_dashboard" {
		return h.refundApplicationFee(ctx, data, true)
	}
	if !data.StripePaymentIntentID.Valid {
		return h.failRefundOperation(ctx, data, errors.New("comanda nu are PaymentIntent Stripe"), true)
	}
	if data.FeePolicy == "refund" && data.PlatformFeeStatus != "refunded" {
		// Return the fee before refunding the customer. A direct-charge account
		// otherwise may be short by exactly the fee that currently sits in the
		// platform balance. Stripe's processing fee still remains the organizer's
		// responsibility.
		if err := h.refundApplicationFee(ctx, data, false); err != nil {
			return err
		}
		data, err = h.queries.GetOrderRefundExecutionData(ctx, operationID)
		if err != nil {
			return err
		}
	}

	params := &stripe.RefundCreateParams{
		PaymentIntent: stripe.String(data.StripePaymentIntentID.String),
		Reason:        stripe.String(string(stripe.RefundReasonRequestedByCustomer)),
		// The Application Fee is handled as a separate, idempotent operation.
		// This also returns the exact remaining fee after any manual partial
		// refunds, instead of Stripe's proportional refund behavior.
		RefundApplicationFee: stripe.Bool(false),
		Metadata: map[string]string{
			"spottr_order_id":            common.UUIDToString(data.OrderID),
			"spottr_refund_operation_id": common.UUIDToString(data.ID),
			"spottr_refund_source":       data.Source,
			"spottr_fee_policy":          data.FeePolicy,
		},
	}
	if data.StripeChargeType.String == "destination" {
		params.ReverseTransfer = stripe.Bool(true)
	} else if data.StripeConnectedAccountID.Valid {
		params.SetStripeAccount(data.StripeConnectedAccountID.String)
	}
	params.SetIdempotencyKey("spottr-order-refund-" + common.UUIDToString(data.OrderID))
	refund, err := h.client.V1Refunds.Create(ctx, params)
	if err != nil {
		return h.failRefundOperation(ctx, data, err, false)
	}
	if refund.Status == stripe.RefundStatusFailed || refund.Status == stripe.RefundStatusCanceled || refund.Status == stripe.RefundStatusRequiresAction {
		return h.failRefundOperation(ctx, data, errors.New("Stripe nu a putut finaliza refundul: "+string(refund.Status)), true)
	}
	if err := h.queries.MarkOrderRefundSubmitted(ctx, db.MarkOrderRefundSubmittedParams{ID: data.ID, Status: "stripe_pending", StripeRefundID: optionalText(refund.ID), StripeApplicationFeeID: data.StripeApplicationFeeID}); err != nil {
		return err
	}
	if refund.Status == stripe.RefundStatusSucceeded {
		chargeID := stripeChargeID(refund.Charge)
		if chargeID == "" {
			chargeID = data.StripeChargeID.String
		}
		if chargeID != "" {
			chargeParams := &stripe.ChargeRetrieveParams{}
			accountID := ""
			if data.StripeChargeType.String != "destination" && data.StripeConnectedAccountID.Valid {
				accountID = data.StripeConnectedAccountID.String
				chargeParams.SetStripeAccount(accountID)
			}
			charge, retrieveErr := h.client.V1Charges.Retrieve(ctx, chargeID, chargeParams)
			if retrieveErr == nil {
				return h.ReconcileChargeRefund(ctx, *charge, accountID, data.StripeLivemode.Bool)
			}
			log.Printf("refund charge refresh deferred to webhook: refund=%s charge=%s err=%v", refund.ID, chargeID, retrieveErr)
		}
	}
	return nil
}

func (h *CheckoutHandler) refundApplicationFee(ctx context.Context, data db.GetOrderRefundExecutionDataRow, completeOperation bool) error {
	if data.FeePolicy == "review" {
		return h.failRefundOperation(ctx, data, errors.New("refundul partial necesita decizie administrativa"), true)
	}
	if data.FeePolicy == "retain" || data.PlatformFeeBani <= 0 {
		if err := h.queries.MarkOrderPlatformFeeRetained(ctx, db.MarkOrderPlatformFeeRetainedParams{OrderID: data.OrderID, RefundOrigin: optionalText(data.Source)}); err != nil {
			return err
		}
		status := "pending"
		if completeOperation {
			status = "succeeded"
		}
		return h.queries.MarkOrderRefundSubmitted(ctx, db.MarkOrderRefundSubmittedParams{ID: data.ID, Status: status, StripeRefundID: data.StripeRefundID, StripeApplicationFeeID: data.StripeApplicationFeeID})
	}
	if data.PlatformFeeStatus == "refunded" {
		status := "pending"
		if completeOperation {
			status = "succeeded"
		}
		return h.queries.MarkOrderRefundSubmitted(ctx, db.MarkOrderRefundSubmittedParams{ID: data.ID, Status: status, StripeRefundID: data.StripeRefundID, StripeApplicationFeeID: data.StripeApplicationFeeID})
	}

	applicationFeeID := data.StripeApplicationFeeID.String
	if applicationFeeID == "" {
		chargeID := data.StripeChargeID.String
		if chargeID == "" && data.StripePaymentIntentID.Valid {
			intentParams := &stripe.PaymentIntentRetrieveParams{}
			if data.StripeChargeType.String != "destination" && data.StripeConnectedAccountID.Valid {
				intentParams.SetStripeAccount(data.StripeConnectedAccountID.String)
			}
			intent, intentErr := h.client.V1PaymentIntents.Retrieve(ctx, data.StripePaymentIntentID.String, intentParams)
			if intentErr != nil {
				return h.failRefundOperation(ctx, data, intentErr, false)
			}
			if intent.LatestCharge != nil {
				chargeID = intent.LatestCharge.ID
			}
		}
		if chargeID == "" {
			return h.failRefundOperation(ctx, data, errors.New("charge-ul Stripe al comenzii nu poate fi identificat"), true)
		}
		params := &stripe.ChargeRetrieveParams{}
		if data.StripeChargeType.String != "destination" && data.StripeConnectedAccountID.Valid {
			params.SetStripeAccount(data.StripeConnectedAccountID.String)
		}
		charge, err := h.client.V1Charges.Retrieve(ctx, chargeID, params)
		if err != nil {
			return h.failRefundOperation(ctx, data, err, false)
		}
		if charge.ApplicationFee == nil || charge.ApplicationFee.ID == "" {
			return h.failRefundOperation(ctx, data, errors.New("Stripe nu a returnat application fee-ul platii"), true)
		}
		applicationFeeID = charge.ApplicationFee.ID
	}
	applicationFee, err := h.client.V1ApplicationFees.Retrieve(ctx, applicationFeeID, nil)
	if err != nil {
		return h.failRefundOperation(ctx, data, err, false)
	}
	remainingFee := min(int64(data.PlatformFeeBani), max(int64(0), applicationFee.Amount-applicationFee.AmountRefunded))
	if remainingFee == 0 {
		if err := h.queries.MarkOrderPlatformFeeRefunded(ctx, db.MarkOrderPlatformFeeRefundedParams{OrderID: data.OrderID, RefundOrigin: optionalText(data.Source)}); err != nil {
			return err
		}
		status := "pending"
		if completeOperation {
			status = "succeeded"
		}
		return h.queries.MarkOrderRefundSubmitted(ctx, db.MarkOrderRefundSubmittedParams{ID: data.ID, Status: status, StripeRefundID: data.StripeRefundID, StripeApplicationFeeID: optionalText(applicationFeeID)})
	}
	params := &stripe.FeeRefundCreateParams{ID: stripe.String(applicationFeeID), Amount: stripe.Int64(remainingFee)}
	params.AddMetadata("spottr_order_id", common.UUIDToString(data.OrderID))
	params.AddMetadata("spottr_refund_operation_id", common.UUIDToString(data.ID))
	params.SetIdempotencyKey("spottr-application-fee-refund-" + common.UUIDToString(data.OrderID))
	feeRefund, err := h.client.V1FeeRefunds.Create(ctx, params)
	if err != nil {
		return h.failRefundOperation(ctx, data, err, false)
	}
	if err := h.queries.MarkOrderPlatformFeeRefunded(ctx, db.MarkOrderPlatformFeeRefundedParams{OrderID: data.OrderID, RefundOrigin: optionalText(data.Source)}); err != nil {
		return err
	}
	if completeOperation {
		return h.queries.MarkOrderFeeRefundCompleted(ctx, db.MarkOrderFeeRefundCompletedParams{
			ID: data.ID, StripeApplicationFeeID: optionalText(applicationFeeID), StripeFeeRefundID: optionalText(feeRefund.ID), ApplicationFeeRefundedBani: applicationFee.AmountRefunded + feeRefund.Amount,
		})
	}
	return h.queries.MarkOrderApplicationFeeRefunded(ctx, db.MarkOrderApplicationFeeRefundedParams{
		ID: data.ID, StripeApplicationFeeID: optionalText(applicationFeeID), StripeFeeRefundID: optionalText(feeRefund.ID), ApplicationFeeRefundedBani: applicationFee.AmountRefunded + feeRefund.Amount,
	})
}

func (h *CheckoutHandler) failRefundOperation(ctx context.Context, data db.GetOrderRefundExecutionDataRow, cause error, needsReview bool) error {
	retrySeconds := int32(30)
	if data.AttemptCount > 1 {
		retrySeconds = min(3600, int32(30*(1<<min(data.AttemptCount-1, 6))))
	}
	if data.AttemptCount >= 10 {
		needsReview = true
	}
	_ = h.queries.MarkOrderRefundFailed(ctx, db.MarkOrderRefundFailedParams{ID: data.ID, NeedsReview: needsReview, ErrorMessage: optionalText(cause.Error()), RetrySeconds: retrySeconds})
	if needsReview {
		_ = h.queries.MarkOrderPlatformFeePending(ctx, db.MarkOrderPlatformFeePendingParams{OrderID: data.OrderID, Status: "needs_review", RefundOrigin: optionalText(data.Source), NeedsAttention: true})
	}
	return cause
}

func authenticatedUUID(w http.ResponseWriter, r *http.Request) (pgtype.UUID, bool) {
	value, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return pgtype.UUID{}, false
	}
	var id pgtype.UUID
	if err := id.Scan(value); err != nil || !id.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return pgtype.UUID{}, false
	}
	return id, true
}

func pathUUID(w http.ResponseWriter, r *http.Request, name, message string) (pgtype.UUID, bool) {
	var id pgtype.UUID
	if err := id.Scan(chi.URLParam(r, name)); err != nil || !id.Valid {
		router.RespondWithError(w, http.StatusBadRequest, message)
		return pgtype.UUID{}, false
	}
	return id, true
}

func optionalText(value string) pgtype.Text {
	return pgtype.Text{String: value, Valid: value != ""}
}

func mapCancellationRequest(request db.EventCancellationRequests) CancellationRequestResponse {
	return CancellationRequestResponse{
		ID: common.UUIDToString(request.ID), EventID: common.UUIDToString(request.EventID), OrganizerID: common.UUIDToString(request.OrganizerID),
		PreviousEventStatus: request.PreviousEventStatus, Reason: request.Reason, EvidenceURL: request.EvidenceUrl.String,
		Status: request.Status, FeePolicy: request.FeePolicy.String, AdminNote: request.AdminNote.String,
		CreatedAt: common.TimestampToString(request.CreatedAt), UpdatedAt: common.TimestampToString(request.UpdatedAt),
	}
}
