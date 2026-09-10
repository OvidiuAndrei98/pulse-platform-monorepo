package organizer

import db "pulse-api/db/generated"

func IsVerified(profile db.OrganizerProfiles) bool {
	return profile.IsVerified.Bool && profile.VerificationStatus == db.VerificationStatusTypeApproved
}

func CanSellTickets(profile db.OrganizerProfiles) bool {
	return IsVerified(profile) &&
		profile.StripeChargeType.Valid && profile.StripeChargeType.String == "direct" &&
		profile.StripeChargesEnabled && profile.StripePayoutsEnabled
}
