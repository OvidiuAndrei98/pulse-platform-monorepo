package organizer

import (
	db "pulse-api/db/generated"
	"pulse-api/internal/common"
)

type OrganizerProfileResponse struct {
	ID                     string `json:"id"`
	UserID                 string `json:"userId"`
	Cui                    string `json:"cui"`
	CompanyName            string `json:"companyName"`
	FiscalAddress          string `json:"fiscalAddress"`
	IsVerified             bool   `json:"isVerified"`
	VerifiedAt             string `json:"verifiedAt,omitempty"`
	CreatedAt              string `json:"createdAt"`
	UpdatedAt              string `json:"updatedAt"`
	VerificationStatus     string `json:"verificationStatus"`
	StripeAccountID        string `json:"stripeAccountId,omitempty"`
	StripeChargesEnabled   bool   `json:"stripeChargesEnabled"`
	StripePayoutsEnabled   bool   `json:"stripePayoutsEnabled"`
	StripeDetailsSubmitted bool   `json:"stripeDetailsSubmitted"`
	OrganizerAgreementVersion    string `json:"organizerAgreementVersion,omitempty"`
	OrganizerAgreementAcceptedAt string `json:"organizerAgreementAcceptedAt,omitempty"`
}

func MapOrganizerProfile(p db.OrganizerProfiles) OrganizerProfileResponse {
	return OrganizerProfileResponse{
		ID:                     common.UUIDToString(p.ID),
		UserID:                 common.UUIDToString(p.UserID),
		Cui:                    p.Cui,
		CompanyName:            p.CompanyName,
		FiscalAddress:          p.FiscalAddress,
		IsVerified:             p.IsVerified.Bool,
		VerifiedAt:             common.TimestampToString(p.VerifiedAt),
		CreatedAt:              common.TimestampToString(p.CreatedAt),
		UpdatedAt:              common.TimestampToString(p.UpdatedAt),
		VerificationStatus:     string(p.VerificationStatus),
		StripeAccountID:        p.StripeAccountID.String,
		StripeChargesEnabled:   p.StripeChargesEnabled,
		StripePayoutsEnabled:   p.StripePayoutsEnabled,
		StripeDetailsSubmitted: p.StripeDetailsSubmitted,
		OrganizerAgreementVersion:    p.OrganizerAgreementVersion.String,
		OrganizerAgreementAcceptedAt: common.TimestampToString(p.OrganizerAgreementAcceptedAt),
	}
}
