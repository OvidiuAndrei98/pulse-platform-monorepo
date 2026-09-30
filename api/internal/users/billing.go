package users

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	db "pulse-api/db/generated"
	"pulse-api/internal/router"

	"github.com/jackc/pgx/v5"
)

type BillingDetails struct {
	Type               string `json:"type"`
	Name               string `json:"name"`
	TaxID              string `json:"taxId"`
	RegistrationNumber string `json:"registrationNumber"`
	Address            string `json:"address"`
	City               string `json:"city"`
	County             string `json:"county"`
	Sector             string `json:"sector"`
	Country            string `json:"country"`
}

type billingDetailsEnvelope struct {
	Details *BillingDetails `json:"details,omitempty"`
}

func normalizeBillingDetails(details BillingDetails) (BillingDetails, error) {
	details.Type = strings.TrimSpace(details.Type)
	details.Name = strings.TrimSpace(details.Name)
	details.TaxID = strings.TrimSpace(details.TaxID)
	details.RegistrationNumber = strings.TrimSpace(details.RegistrationNumber)
	details.Address = strings.TrimSpace(details.Address)
	details.City = strings.TrimSpace(details.City)
	details.County = strings.TrimSpace(details.County)
	details.Sector = strings.TrimSpace(details.Sector)
	details.Country = strings.TrimSpace(details.Country)

	if details.Type != "individual" && details.Type != "company" {
		return BillingDetails{}, errors.New("tipul datelor de facturare este invalid")
	}
	if len(details.Name) < 2 || len(details.Name) > 200 {
		return BillingDetails{}, errors.New("numele de facturare trebuie sa aiba intre 2 si 200 de caractere")
	}
	if details.Address == "" || len(details.Address) > 300 || details.City == "" || len(details.City) > 100 || details.Country == "" || len(details.Country) > 100 {
		return BillingDetails{}, errors.New("adresa, orasul si tara sunt obligatorii")
	}
	if len(details.TaxID) > 64 || len(details.RegistrationNumber) > 64 || len(details.County) > 100 || len(details.Sector) > 32 {
		return BillingDetails{}, errors.New("unul dintre campurile de facturare este prea lung")
	}
	if details.Type == "company" && details.TaxID == "" {
		return BillingDetails{}, errors.New("codul fiscal este obligatoriu pentru companie")
	}
	if details.Type == "individual" {
		details.TaxID = ""
		details.RegistrationNumber = ""
	}

	city := strings.ToLower(details.City)
	country := strings.ToLower(details.Country)
	isBucharest := (country == "romania" || country == "ro") && (city == "bucuresti" || city == "bucharest")
	if isBucharest {
		if details.Sector == "" {
			return BillingDetails{}, errors.New("sectorul este obligatoriu pentru Bucuresti")
		}
		details.County = "Bucuresti"
	} else if details.County == "" {
		return BillingDetails{}, errors.New("judetul este obligatoriu")
	}

	return details, nil
}

func mapBillingDetails(billingType, name, taxID, registrationNumber, address, city, county, sector, country string) BillingDetails {
	return BillingDetails{
		Type:               billingType,
		Name:               name,
		TaxID:              taxID,
		RegistrationNumber: registrationNumber,
		Address:            address,
		City:               city,
		County:             county,
		Sector:             sector,
		Country:            country,
	}
}

func (h *Handler) HandleGetBillingDetails(w http.ResponseWriter, r *http.Request) {
	userID, ok := preferenceUserID(r)
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	row, err := h.Queries.GetUserBillingDetails(r.Context(), userID)
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithJSON(w, http.StatusOK, billingDetailsEnvelope{})
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Datele de facturare nu au putut fi incarcate")
		return
	}

	details := mapBillingDetails(row.BillingType, row.Name, row.TaxID, row.RegistrationNumber, row.Address, row.City, row.County, row.Sector, row.Country)
	router.RespondWithJSON(w, http.StatusOK, billingDetailsEnvelope{Details: &details})
}

func (h *Handler) HandleSaveBillingDetails(w http.ResponseWriter, r *http.Request) {
	userID, ok := preferenceUserID(r)
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var request BillingDetails
	if err := decoder.Decode(&request); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Datele de facturare sunt invalide")
		return
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid")
		return
	}
	details, err := normalizeBillingDetails(request)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	row, err := h.Queries.UpsertUserBillingDetails(r.Context(), db.UpsertUserBillingDetailsParams{
		UserID:             userID,
		BillingType:        details.Type,
		Name:               details.Name,
		TaxID:              details.TaxID,
		RegistrationNumber: details.RegistrationNumber,
		Address:            details.Address,
		City:               details.City,
		County:             details.County,
		Sector:             details.Sector,
		Country:            details.Country,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Datele de facturare nu au putut fi salvate")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, mapBillingDetails(row.BillingType, row.Name, row.TaxID, row.RegistrationNumber, row.Address, row.City, row.County, row.Sector, row.Country))
}

func (h *Handler) HandleDeleteBillingDetails(w http.ResponseWriter, r *http.Request) {
	userID, ok := preferenceUserID(r)
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	if err := h.Queries.DeleteUserBillingDetails(r.Context(), userID); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Datele de facturare nu au putut fi sterse")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
