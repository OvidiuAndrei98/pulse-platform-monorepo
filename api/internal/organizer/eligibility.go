package organizer

import db "pulse-api/db/generated"

func IsVerified(profile db.OrganizerProfiles) bool {
	return profile.IsVerified.Bool && profile.VerificationStatus == db.VerificationStatusTypeApproved
}

func CanSellTickets(profile db.OrganizerProfiles) bool {
	return IsVerified(profile) && profile.StripeChargesEnabled && profile.StripePayoutsEnabled
}
