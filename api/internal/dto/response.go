package dto

import (
	"fmt"
	"time"

	db "pulse-api/db/generated"

	"github.com/jackc/pgx/v5/pgtype"
)

// uuidToString converts pgtype.UUID to the standard xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx string.
func uuidToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	b := u.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func timestampToString(t pgtype.Timestamptz) string {
	if !t.Valid {
		return ""
	}
	return t.Time.UTC().Format(time.RFC3339)
}

// --- USER ---

type UserResponse struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	AvatarUrl string `json:"avatarUrl,omitempty"`
	Bio       string `json:"bio,omitempty"`
	CreatedAt string `json:"createdAt"`
}

func MapUser(u db.Users) UserResponse {
	return UserResponse{
		ID:        uuidToString(u.ID),
		Username:  u.Username,
		Email:     u.Email,
		Role:      u.Role.String,
		AvatarUrl: u.AvatarUrl.String,
		Bio:       u.Bio.String,
		CreatedAt: timestampToString(u.CreatedAt),
	}
}

func MapFriendsRow(u db.GetFriendsRow) UserResponse {
	return UserResponse{
		ID:        uuidToString(u.ID),
		Username:  u.Username,
		Email:     u.Email,
		Role:      u.Role.String,
		AvatarUrl: u.AvatarUrl.String,
		Bio:       u.Bio.String,
		CreatedAt: timestampToString(u.CreatedAt),
	}
}

func MapUpdateUserProfileRow(u db.UpdateUserProfileRow) UserResponse {
	return UserResponse{
		ID:        uuidToString(u.ID),
		Username:  u.Username,
		Email:     u.Email,
		Role:      u.Role.String,
		AvatarUrl: u.AvatarUrl.String,
		Bio:       u.Bio.String,
		CreatedAt: timestampToString(u.CreatedAt),
	}
}

// --- EVENT ---

type EventResponse struct {
	ID           string  `json:"id"`
	OrganizerID  string  `json:"organizerId"`
	Title        string  `json:"title"`
	Description  string  `json:"description,omitempty"`
	Category     string  `json:"category"`
	BannerUrl    string  `json:"bannerUrl,omitempty"`
	LocationName string  `json:"locationName"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	StartTime    string  `json:"startTime"`
	EndTime      string  `json:"endTime"`
	IsLive       bool    `json:"isLive"`
	CreatedAt    string  `json:"createdAt"`
}

type EventWithStatsResponse struct {
	EventResponse
	TotalCheckIns    int  `json:"totalCheckIns"`
	UserHasCheckedIn bool `json:"userHasCheckedIn"`
}

func MapGetEventByIDRow(e db.GetEventByIDRow) EventResponse {
	return EventResponse{
		ID:           uuidToString(e.ID),
		OrganizerID:  uuidToString(e.OrganizerID),
		Title:        e.Title,
		Description:  e.Description.String,
		Category:     e.Category,
		BannerUrl:    e.BannerUrl.String,
		LocationName: e.LocationName,
		Latitude:     e.Latitude,
		Longitude:    e.Longitude,
		StartTime:    timestampToString(e.StartTime),
		EndTime:      timestampToString(e.EndTime),
		IsLive:       e.IsLive.Bool,
		CreatedAt:    timestampToString(e.CreatedAt),
	}
}

func MapListEventsRow(e db.ListEventsRow) EventResponse {
	return EventResponse{
		ID:           uuidToString(e.ID),
		OrganizerID:  uuidToString(e.OrganizerID),
		Title:        e.Title,
		Description:  e.Description.String,
		Category:     e.Category,
		BannerUrl:    e.BannerUrl.String,
		LocationName: e.LocationName,
		Latitude:     e.Latitude,
		Longitude:    e.Longitude,
		StartTime:    timestampToString(e.StartTime),
		EndTime:      timestampToString(e.EndTime),
		IsLive:       e.IsLive.Bool,
		CreatedAt:    timestampToString(e.CreatedAt),
	}
}

func MapGetLiveEventsInAreaRow(e db.GetLiveEventsInAreaRow) EventResponse {
	return EventResponse{
		ID:           uuidToString(e.ID),
		OrganizerID:  uuidToString(e.OrganizerID),
		Title:        e.Title,
		Description:  e.Description.String,
		Category:     e.Category,
		BannerUrl:    e.BannerUrl.String,
		LocationName: e.LocationName,
		Latitude:     e.Latitude,
		Longitude:    e.Longitude,
		StartTime:    timestampToString(e.StartTime),
		EndTime:      timestampToString(e.EndTime),
		IsLive:       e.IsLive.Bool,
		CreatedAt:    timestampToString(e.CreatedAt),
	}
}

func MapGetEventWithStatsRow(e db.GetEventWithStatsRow) EventWithStatsResponse {
	return EventWithStatsResponse{
		EventResponse: EventResponse{
			ID:           uuidToString(e.ID),
			OrganizerID:  uuidToString(e.OrganizerID),
			Title:        e.Title,
			Description:  e.Description.String,
			Category:     e.Category,
			BannerUrl:    e.BannerUrl.String,
			LocationName: e.LocationName,
			Latitude:     e.Latitude,
			Longitude:    e.Longitude,
			StartTime:    timestampToString(e.StartTime),
			EndTime:      timestampToString(e.EndTime),
			IsLive:       e.IsLive.Bool,
			CreatedAt:    timestampToString(e.CreatedAt),
		},
		TotalCheckIns:    int(e.CheckInsCount),
		UserHasCheckedIn: e.UserHasCheckedIn,
	}
}

func MapEvents(e db.Events) EventResponse {
	return EventResponse{
		ID:           uuidToString(e.ID),
		OrganizerID:  uuidToString(e.OrganizerID),
		Title:        e.Title,
		Description:  e.Description.String,
		Category:     e.Category,
		BannerUrl:    e.BannerUrl.String,
		LocationName: e.LocationName,
		Latitude:     e.Latitude,
		Longitude:    e.Longitude,
		StartTime:    timestampToString(e.StartTime),
		EndTime:      timestampToString(e.EndTime),
		IsLive:       e.IsLive.Bool,
		CreatedAt:    timestampToString(e.CreatedAt),
	}
}

// --- COMMENT ---

type CommentResponse struct {
	ID        string `json:"id"`
	EventID   string `json:"eventId"`
	UserID    string `json:"userId"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

func MapComment(c db.Comments) CommentResponse {
	return CommentResponse{
		ID:        uuidToString(c.ID),
		EventID:   uuidToString(c.EventID),
		UserID:    uuidToString(c.UserID),
		Content:   c.Content,
		CreatedAt: timestampToString(c.CreatedAt),
	}
}

// --- ORGANIZER PROFILE ---

type OrganizerProfileResponse struct {
	ID                 string `json:"id"`
	UserID             string `json:"userId"`
	Cui                string `json:"cui"`
	CompanyName        string `json:"companyName"`
	FiscalAddress      string `json:"fiscalAddress"`
	IsVerified         bool   `json:"isVerified"`
	VerifiedAt         string `json:"verifiedAt"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
	VerificationStatus string `json:"verificationStatus"`
}

func MapOrganizerProfile(p db.OrganizerProfiles) OrganizerProfileResponse {
	return OrganizerProfileResponse{
		ID:                 uuidToString(p.ID),
		UserID:             uuidToString(p.UserID),
		Cui:                p.Cui,
		CompanyName:        p.CompanyName,
		FiscalAddress:      p.FiscalAddress,
		IsVerified:         bool(p.IsVerified.Bool),
		VerifiedAt:         timestampToString(p.VerifiedAt),
		CreatedAt:          timestampToString(p.CreatedAt),
		UpdatedAt:          timestampToString(p.UpdatedAt),
		VerificationStatus: string(p.VerificationStatus),
	}
}

// --- ORDER ---

type OrderStatus string

const (
	OrderStatusPending   OrderStatus = "pending"
	OrderStatusCompleted OrderStatus = "completed"
	OrderStatusCanceled  OrderStatus = "canceled"
	OrderStatusRefunded  OrderStatus = "refunded"
)

type OrderResponse struct {
	ID                    pgtype.UUID        `json:"id"`
	UserID                pgtype.UUID        `json:"user_id"`
	EventID               pgtype.UUID        `json:"event_id"`
	Email                 string             `json:"email"`
	StripePaymentIntentID pgtype.Text        `json:"stripe_payment_intent_id"`
	Status                OrderStatus        `json:"status"`
	TotalAmount           int32              `json:"total_amount"`
	CreatedAt             pgtype.Timestamptz `json:"created_at"`
}

func MapOrder(order db.Orders) OrderResponse {
	return OrderResponse{
		ID:                    order.ID,
		UserID:                order.UserID,
		EventID:               order.EventID,
		Email:                 order.Email,
		StripePaymentIntentID: order.StripePaymentIntentID,
		Status:                OrderStatus(order.Status),
		TotalAmount:           order.TotalAmount,
		CreatedAt:             order.CreatedAt,
	}
}

// --- TICKET ---

type TicketTypesResponse struct {
	ID          pgtype.UUID        `json:"id"`
	EventID     pgtype.UUID        `json:"event_id"`
	Name        string             `json:"name"`
	PriceRon    int32              `json:"price_ron"`
	Capacity    int32              `json:"capacity"`
	TicketsSold int32              `json:"tickets_sold"`
	StartSales  pgtype.Timestamptz `json:"start_sales"`
	EndSales    pgtype.Timestamptz `json:"end_sales"`
	CreatedAt   pgtype.Timestamptz `json:"created_at"`
	UpdatedAt   pgtype.Timestamptz `json:"updated_at"`
}

type TicketValidationResponse struct {
	Status      string             `json:"status"`
	TicketID    pgtype.UUID        `json:"ticketId"`
	TicketType  string             `json:"ticketType"`
	EventTitle  string             `json:"eventTitle"`
	ValidatedAt pgtype.Timestamptz `json:"validatedAt"`
}

func MapTicketTypesList(ticketTypes db.TicketTypes) TicketTypesResponse {
	return TicketTypesResponse{
		ID:          ticketTypes.ID,
		EventID:     ticketTypes.EventID,
		Name:        ticketTypes.Name,
		PriceRon:    ticketTypes.PriceRon,
		Capacity:    ticketTypes.Capacity,
		TicketsSold: ticketTypes.TicketsSold,
		StartSales:  ticketTypes.StartSales,
		EndSales:    ticketTypes.EndSales,
		CreatedAt:   ticketTypes.CreatedAt,
		UpdatedAt:   ticketTypes.UpdatedAt,
	}
}
