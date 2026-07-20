package tickets

import (
	db "pulse-api/db/generated"
	"pulse-api/internal/common"
)

type OrderStatus string

const (
	OrderStatusPending   OrderStatus = "pending"
	OrderStatusCompleted OrderStatus = "completed"
	OrderStatusCanceled  OrderStatus = "canceled"
	OrderStatusRefunded  OrderStatus = "refunded"
)

type OrderResponse struct {
	ID                    string      `json:"id"`
	UserID                string      `json:"userId"`
	EventID               string      `json:"eventId"`
	Email                 string      `json:"email"`
	StripePaymentIntentID string      `json:"stripePaymentIntentId,omitempty"`
	Status                OrderStatus `json:"status"`
	TotalAmount           int32       `json:"totalAmount"`
	CreatedAt             string      `json:"createdAt"`
}

func MapOrder(order db.Orders) OrderResponse {
	return OrderResponse{
		ID:                    common.UUIDToString(order.ID),
		UserID:                common.UUIDToString(order.UserID),
		EventID:               common.UUIDToString(order.EventID),
		Email:                 order.Email,
		StripePaymentIntentID: order.StripePaymentIntentID.String,
		Status:                OrderStatus(order.Status),
		TotalAmount:           order.TotalAmount,
		CreatedAt:             common.TimestampToString(order.CreatedAt),
	}
}

type TicketTypesResponse struct {
	ID          string `json:"id"`
	EventID     string `json:"eventId"`
	Name        string `json:"name"`
	PriceRon    int32  `json:"priceRon"`
	Capacity    int32  `json:"capacity"`
	TicketsSold int32  `json:"ticketsSold"`
	StartSales  string `json:"startSales"`
	EndSales    string `json:"endSales"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
	Description string `json:"description,omitempty"`
}

type TicketValidationResponse struct {
	Status      string `json:"status"`
	TicketID    string `json:"ticketId"`
	TicketType  string `json:"ticketType"`
	EventTitle  string `json:"eventTitle"`
	ValidatedAt string `json:"validatedAt"`
}

func MapTicketTypesList(t db.TicketTypes) TicketTypesResponse {
	return TicketTypesResponse{
		ID:          common.UUIDToString(t.ID),
		EventID:     common.UUIDToString(t.EventID),
		Name:        t.Name,
		PriceRon:    t.PriceRon,
		Capacity:    t.Capacity,
		TicketsSold: t.TicketsSold,
		StartSales:  common.TimestampToString(t.StartSales),
		EndSales:    common.TimestampToString(t.EndSales),
		CreatedAt:   common.TimestampToString(t.CreatedAt),
		UpdatedAt:   common.TimestampToString(t.UpdatedAt),
		Description: t.Description.String,
	}
}

func MapTicketValidationResponse(t db.GetTicketByHashRow) TicketValidationResponse {
	return TicketValidationResponse{
		Status:      "validated",
		TicketID:    common.UUIDToString(t.ID),
		TicketType:  t.TicketTypeName,
		EventTitle:  t.EventTitle,
		ValidatedAt: common.TimestampToString(t.ValidatedAt),
	}
}
