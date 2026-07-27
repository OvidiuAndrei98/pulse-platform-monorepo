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

type UserTicketResponse struct {
	ID                     string `json:"id"`
	EventID                string `json:"eventId"`
	ValidationHash         string `json:"validationHash"`
	IsValidated            bool   `json:"isValidated"`
	ValidatedAt            string `json:"validatedAt,omitempty"`
	TicketTypeName         string `json:"ticketTypeName"`
	EventTitle             string `json:"eventTitle"`
	LocationName           string `json:"locationName"`
	StartTime              string `json:"startTime"`
	EndTime                string `json:"endTime"`
	PriceRon               int32  `json:"priceRon"`
	OrganizerCompanyName   string `json:"organizerCompanyName"`
	OrganizerCui           string `json:"organizerCui"`
	OrganizerFiscalAddress string `json:"organizerFiscalAddress"`
}

type UserOrderResponse struct {
	ID                    string `json:"id"`
	Status                string `json:"status"`
	TotalAmountRon        int32  `json:"totalAmountRon"`
	CreatedAt             string `json:"createdAt"`
	StripePaymentIntentID string `json:"stripePaymentIntentId,omitempty"`
	EventID               string `json:"eventId"`
	EventTitle            string `json:"eventTitle"`
	LocationName          string `json:"locationName"`
	StartTime             string `json:"startTime"`
}

type ValidationEventResponse struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	StartTime    string `json:"startTime"`
	EndTime      string `json:"endTime"`
	Status       string `json:"status"`
	LocationName string `json:"locationName"`
	CanManage    bool   `json:"canManage"`
}

type ValidationStaffResponse struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Email     string `json:"email"`
	CreatedAt string `json:"createdAt"`
}

func MapValidationEvent(event db.ListValidationEventsRow) ValidationEventResponse {
	return ValidationEventResponse{
		ID:           common.UUIDToString(event.ID),
		Title:        event.Title,
		StartTime:    common.TimestampToString(event.StartTime),
		EndTime:      common.TimestampToString(event.EndTime),
		Status:       event.Status,
		LocationName: event.LocationName,
		CanManage:    event.CanManage,
	}
}

type ScannerAccessResponse struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	StartsAt  string `json:"startsAt"`
	EndsAt    string `json:"endsAt"`
	RevokedAt string `json:"revokedAt,omitempty"`
	CreatedAt string `json:"createdAt"`
}

type CreateScannerAccessResponse struct {
	ScannerAccessResponse
	URL string `json:"url"`
}

type ScannerSessionResponse struct {
	SessionToken string `json:"sessionToken"`
	Label        string `json:"label"`
	EventTitle   string `json:"eventTitle"`
	LocationName string `json:"locationName"`
	ExpiresAt    string `json:"expiresAt"`
}

func MapScannerAccess(access db.ListScannerAccessRow) ScannerAccessResponse {
	return ScannerAccessResponse{
		ID:        common.UUIDToString(access.ID),
		Label:     access.Label,
		StartsAt:  common.TimestampToString(access.StartsAt),
		EndsAt:    common.TimestampToString(access.EndsAt),
		RevokedAt: common.TimestampToString(access.RevokedAt),
		CreatedAt: common.TimestampToString(access.CreatedAt),
	}
}

func MapValidationStaff(member db.ListValidationStaffRow) ValidationStaffResponse {
	return ValidationStaffResponse{
		ID:        common.UUIDToString(member.ID),
		Username:  member.Username,
		Email:     member.Email,
		CreatedAt: common.TimestampToString(member.CreatedAt),
	}
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

func MapUserTicket(ticket db.GetUserTicketsRow) UserTicketResponse {
	return UserTicketResponse{
		ID:                     common.UUIDToString(ticket.ID),
		EventID:                common.UUIDToString(ticket.EventID),
		ValidationHash:         ticket.ValidationHash,
		IsValidated:            ticket.IsValidated,
		ValidatedAt:            common.TimestampToString(ticket.ValidatedAt),
		TicketTypeName:         ticket.TicketTypeName,
		EventTitle:             ticket.EventTitle,
		LocationName:           ticket.LocationName,
		StartTime:              common.TimestampToString(ticket.StartTime),
		EndTime:                common.TimestampToString(ticket.EndTime),
		PriceRon:               ticket.UnitPriceRon,
		OrganizerCompanyName:   ticket.OrganizerCompanyName,
		OrganizerCui:           ticket.OrganizerCui,
		OrganizerFiscalAddress: ticket.OrganizerFiscalAddress,
	}
}

func MapUserOrder(order db.ListUserOrdersRow) UserOrderResponse {
	return UserOrderResponse{
		ID:                    common.UUIDToString(order.ID),
		Status:                string(order.Status),
		TotalAmountRon:        order.TotalAmount,
		CreatedAt:             common.TimestampToString(order.CreatedAt),
		StripePaymentIntentID: order.StripePaymentIntentID.String,
		EventID:               common.UUIDToString(order.EventID),
		EventTitle:            order.EventTitle,
		LocationName:          order.LocationName,
		StartTime:             common.TimestampToString(order.StartTime),
	}
}
