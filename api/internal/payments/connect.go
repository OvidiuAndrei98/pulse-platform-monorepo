package payments

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/organizer"
	"pulse-api/internal/router"
)

type ConnectHandler struct {
	queries *db.Queries
	client  *stripe.Client
	appURL  string
	country string
}

type ConnectAccountLinkResponse struct {
	URL string `json:"url"`
}

func NewConnectHandler(queries *db.Queries, stripeSecret, appURL, country string) *ConnectHandler {
	if appURL == "" {
		appURL = "http://localhost:3000"
	}
	if country == "" {
		country = "RO"
	}

	return &ConnectHandler{
		queries: queries,
		client:  stripe.NewClient(stripeSecret),
		appURL:  strings.TrimRight(appURL, "/"),
		country: strings.ToUpper(country),
	}
}

func (h *ConnectHandler) HandleCreateAccountLink(w http.ResponseWriter, r *http.Request) {
	userID, profile, ok := h.getVerifiedOrganizerProfile(w, r)
	if !ok {
		return
	}

	stripeAccountID := profile.StripeAccountID.String
	if profile.StripeAccountID.Valid {
		account, err := h.client.V1Accounts.GetByID(r.Context(), stripeAccountID, nil)
		if err != nil {
			if !isStripeAccountMissing(err) {
				router.RespondWithError(w, http.StatusBadGateway, "Contul Stripe nu a putut fi verificat")
				return
			}
			profile, err = h.clearStripeAccount(r.Context(), stripeAccountID)
			if err != nil {
				router.RespondWithError(w, http.StatusInternalServerError, "Legatura cu vechiul cont Stripe nu a putut fi resetata")
				return
			}
			stripeAccountID = ""
		} else if account.Deleted {
			profile, err = h.clearStripeAccount(r.Context(), stripeAccountID)
			if err != nil {
				router.RespondWithError(w, http.StatusInternalServerError, "Legatura cu vechiul cont Stripe nu a putut fi resetata")
				return
			}
			stripeAccountID = ""
		}
	}

	if !profile.StripeAccountID.Valid {
		user, err := h.queries.GetUserByID(r.Context(), userID)
		if err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Utilizatorul nu a putut fi incarcat")
			return
		}

		account, err := h.client.V1Accounts.Create(r.Context(), &stripe.AccountCreateParams{
			Type:            stripe.String("express"),
			Country:         stripe.String(h.country),
			DefaultCurrency: stripe.String("ron"),
			BusinessType:    stripe.String("company"),
			Email:           stripe.String(user.Email),
			Company: &stripe.AccountCreateCompanyParams{
				Name: stripe.String(profile.CompanyName),
			},
			BusinessProfile: &stripe.AccountCreateBusinessProfileParams{
				Name: stripe.String(profile.CompanyName),
			},
			Capabilities: &stripe.AccountCreateCapabilitiesParams{
				CardPayments: &stripe.AccountCreateCapabilitiesCardPaymentsParams{Requested: stripe.Bool(true)},
				Transfers:    &stripe.AccountCreateCapabilitiesTransfersParams{Requested: stripe.Bool(true)},
			},
			Metadata: map[string]string{
				"spottr_organizer_id": organizerIDString(userID),
			},
		})
		if err != nil {
			router.RespondWithError(w, http.StatusBadGateway, "Contul Stripe nu a putut fi creat")
			return
		}

		stripeAccountID = account.ID
		profile, err = h.queries.SetOrganizerStripeAccount(r.Context(), db.SetOrganizerStripeAccountParams{
			UserID:                 userID,
			StripeAccountID:        pgtype.Text{String: account.ID, Valid: true},
			StripeChargesEnabled:   account.ChargesEnabled,
			StripePayoutsEnabled:   account.PayoutsEnabled,
			StripeDetailsSubmitted: account.DetailsSubmitted,
		})
		if err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Contul Stripe nu a putut fi asociat organizatorului")
			return
		}
	}

	link, err := h.client.V1AccountLinks.Create(r.Context(), &stripe.AccountLinkCreateParams{
		Account:    stripe.String(stripeAccountID),
		RefreshURL: stripe.String(h.appURL + "/dashboard?stripe=refresh"),
		ReturnURL:  stripe.String(h.appURL + "/dashboard?stripe=complete"),
		Type:       stripe.String("account_onboarding"),
	})
	if err != nil {
		if isStripeAccountMissing(err) {
			if _, clearErr := h.clearStripeAccount(r.Context(), stripeAccountID); clearErr != nil && !errors.Is(clearErr, pgx.ErrNoRows) {
				log.Printf("Stripe account cleanup failed after onboarding account disappeared: account=%s err=%v", stripeAccountID, clearErr)
			}
			router.RespondWithError(w, http.StatusConflict, "Contul Stripe a fost inchis. Porneste din nou conectarea")
			return
		}
		router.RespondWithError(w, http.StatusBadGateway, "Linkul Stripe pentru configurarea platilor nu a putut fi creat")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, ConnectAccountLinkResponse{URL: link.URL})
}

func (h *ConnectHandler) HandleGetAccountStatus(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.getOrganizerProfile(w, r)
	if !ok {
		return
	}

	if !profile.StripeAccountID.Valid {
		router.RespondWithJSON(w, http.StatusOK, organizer.MapOrganizerProfile(profile))
		return
	}

	account, err := h.client.V1Accounts.GetByID(r.Context(), profile.StripeAccountID.String, nil)
	if err != nil {
		if isStripeAccountMissing(err) {
			profile, clearErr := h.clearStripeAccount(r.Context(), profile.StripeAccountID.String)
			if clearErr != nil {
				router.RespondWithError(w, http.StatusInternalServerError, "Legatura cu vechiul cont Stripe nu a putut fi resetata")
				return
			}
			router.RespondWithJSON(w, http.StatusOK, organizer.MapOrganizerProfile(profile))
			return
		}
		router.RespondWithError(w, http.StatusBadGateway, "Starea contului Stripe nu a putut fi actualizata")
		return
	}
	if account.Deleted {
		profile, err = h.clearStripeAccount(r.Context(), profile.StripeAccountID.String)
		if err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Legatura cu vechiul cont Stripe nu a putut fi resetata")
			return
		}
		router.RespondWithJSON(w, http.StatusOK, organizer.MapOrganizerProfile(profile))
		return
	}

	profile, err = h.queries.UpdateOrganizerStripeAccountStatus(r.Context(), db.UpdateOrganizerStripeAccountStatusParams{
		StripeAccountID:        profile.StripeAccountID,
		StripeChargesEnabled:   account.ChargesEnabled,
		StripePayoutsEnabled:   account.PayoutsEnabled,
		StripeDetailsSubmitted: account.DetailsSubmitted,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Starea Stripe nu a putut fi salvata")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, organizer.MapOrganizerProfile(profile))
}

// HandleCreateDashboardLoginLink creates a short-lived, single-use Stripe Express
// Dashboard link for the currently authenticated organizer.
func (h *ConnectHandler) HandleCreateDashboardLoginLink(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.getOrganizerProfile(w, r)
	if !ok {
		return
	}

	if !profile.StripeAccountID.Valid || profile.StripeAccountID.String == "" {
		router.RespondWithError(w, http.StatusConflict, "Conecteaza mai intai contul Stripe")
		return
	}

	link, err := h.client.V1LoginLinks.Create(r.Context(), &stripe.LoginLinkCreateParams{
		Account: stripe.String(profile.StripeAccountID.String),
	})
	if err != nil {
		if isStripeAccountMissing(err) {
			if _, clearErr := h.clearStripeAccount(r.Context(), profile.StripeAccountID.String); clearErr != nil && !errors.Is(clearErr, pgx.ErrNoRows) {
				log.Printf("Stripe account cleanup failed after missing login account: account=%s err=%v", profile.StripeAccountID.String, clearErr)
			}
			router.RespondWithError(w, http.StatusConflict, "Contul Stripe a fost inchis. Conecteaza un cont nou")
			return
		}
		router.RespondWithError(w, http.StatusBadGateway, "Dashboardul Stripe nu a putut fi deschis")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, ConnectAccountLinkResponse{URL: link.URL})
}

// HandleDisconnectAccount closes the Express account managed by Spottr and only
// removes the local association after Stripe confirms the deletion. Stripe can
// reject live account deletion while the account still has a non-zero balance.
func (h *ConnectHandler) HandleDisconnectAccount(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.getOrganizerProfile(w, r)
	if !ok {
		return
	}

	if !profile.StripeAccountID.Valid || profile.StripeAccountID.String == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	stripeAccountID := profile.StripeAccountID.String
	_, err := h.client.V1Accounts.Delete(r.Context(), stripeAccountID, nil)
	if err != nil && !isStripeAccountMissing(err) {
		router.RespondWithError(w, http.StatusConflict, "Contul Stripe nu poate fi deconectat momentan. Verifica soldul, platile si disputele din Stripe")
		return
	}

	if _, err := h.clearStripeAccount(r.Context(), stripeAccountID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusInternalServerError, "Legatura cu contul Stripe nu a putut fi eliminata")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ConnectHandler) clearStripeAccount(ctx context.Context, stripeAccountID string) (db.OrganizerProfiles, error) {
	return h.queries.ClearOrganizerStripeAccount(ctx, pgtype.Text{String: stripeAccountID, Valid: stripeAccountID != ""})
}

func isStripeAccountMissing(err error) bool {
	var stripeErr *stripe.Error
	return errors.As(err, &stripeErr) &&
		(stripeErr.Code == stripe.ErrorCodeResourceMissing || stripeErr.HTTPStatusCode == http.StatusNotFound)
}

func (h *ConnectHandler) getVerifiedOrganizerProfile(w http.ResponseWriter, r *http.Request) (pgtype.UUID, db.OrganizerProfiles, bool) {
	userID, profile, ok := h.getOrganizerProfile(w, r)
	if !ok {
		return pgtype.UUID{}, db.OrganizerProfiles{}, false
	}
	if !profile.IsVerified.Bool || profile.VerificationStatus != db.VerificationStatusTypeApproved {
		router.RespondWithError(w, http.StatusForbidden, "Profilul organizatorului trebuie validat inainte de configurarea platilor")
		return pgtype.UUID{}, db.OrganizerProfiles{}, false
	}
	if !profile.OrganizerAgreementVersion.Valid || profile.OrganizerAgreementVersion.String != organizer.AgreementVersion {
		router.RespondWithError(w, http.StatusForbidden, "Accepta acordul pentru organizatori inainte de configurarea Stripe")
		return pgtype.UUID{}, db.OrganizerProfiles{}, false
	}

	return userID, profile, true
}

func (h *ConnectHandler) getOrganizerProfile(w http.ResponseWriter, r *http.Request) (pgtype.UUID, db.OrganizerProfiles, bool) {
	userIDString, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return pgtype.UUID{}, db.OrganizerProfiles{}, false
	}

	var userID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID utilizator invalid")
		return pgtype.UUID{}, db.OrganizerProfiles{}, false
	}

	profile, err := h.queries.GetOrganizerProfile(r.Context(), userID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Profilul organizatorului nu a fost gasit")
		return pgtype.UUID{}, db.OrganizerProfiles{}, false
	}
	return userID, profile, true
}

func organizerIDString(id pgtype.UUID) string {
	return common.UUIDToString(id)
}
