package organizer

import (
	"testing"

	db "pulse-api/db/generated"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestOrganizerEligibility(t *testing.T) {
	profile := db.OrganizerProfiles{
		IsVerified:         pgtype.Bool{Bool: true, Valid: true},
		VerificationStatus: db.VerificationStatusTypeApproved,
	}
	if !IsVerified(profile) {
		t.Fatal("expected approved organizer to be verified")
	}
	if CanSellTickets(profile) {
		t.Fatal("expected organizer without Stripe to be unable to sell tickets")
	}

	profile.StripeChargesEnabled = true
	profile.StripePayoutsEnabled = true
	profile.StripeChargeType = pgtype.Text{String: "direct", Valid: true}
	if !CanSellTickets(profile) {
		t.Fatal("expected verified organizer with Stripe enabled to sell tickets")
	}
}
