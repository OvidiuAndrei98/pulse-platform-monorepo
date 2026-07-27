package anaf

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type CompanyInfo struct {
	Name     string
	IsActive bool
	CaenCode string
	Address  string
}

// Structura exactă mapată după JSON-ul brut primit de la demoanaf.ro
type DemoAnafResponse struct {
	Success bool `json:"success"`
	Data    struct {
		RegistrationState   string `json:"registrationState"` // "INREGISTRAT din data..."
		OnrcStatusLabel     string `json:"onrcStatusLabel"`   // "Funcțiune"
		HeadquartersAddress struct {
			Street   string `json:"street"`
			Number   string `json:"number"`
			Locality string `json:"locality"`
			County   string `json:"county"`
		} `json:"headquartersAddress"`
		AuthorizedCaenCodes []string `json:"authorizedCaenCodes"` // Array de string-uri ["6210", "6220"]
	} `json:"data"`
}

func Lookup(ctx context.Context, cuiRaw string, companyName string) (*CompanyInfo, error) {
	cuiStr := strings.TrimSpace(strings.ToUpper(cuiRaw))
	cuiStr = strings.TrimPrefix(cuiStr, "RO")

	if cuiStr == "" {
		return nil, fmt.Errorf("CUI-ul nu poate fi gol")
	}

	url := fmt.Sprintf("https://demoanaf.ro/api/company/%s", cuiStr)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "GlowOnboardingBackend/1.0")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to demoanaf proxy: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("demoanaf proxy returned status code %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var apiResp DemoAnafResponse
	if err := json.Unmarshal(bodyBytes, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to decode proxy response: %w", err)
	}

	// 1. Validare Stare / Status ONRC bazată pe valorile reale ale API-ului
	state := strings.ToUpper(apiResp.Data.RegistrationState)
	onrc := strings.ToUpper(apiResp.Data.OnrcStatusLabel)

	// Compania e activă dacă starea conține "INREGISTRAT" sau "ACTIV" și la ONRC este în "FUNCȚIUNE"
	isActive := (strings.Contains(state, "INREGISTRAT") || strings.Contains(state, "ACTIV")) &&
		(strings.Contains(onrc, "FUNCȚIUNE") || strings.Contains(onrc, "FUNCTIUNE"))

	// 2. Formatăm adresa poștală completă din obiectul primit
	addrObj := apiResp.Data.HeadquartersAddress
	fullAddress := fmt.Sprintf("Str. %s, Nr. %s, %s, %s", addrObj.Street, addrObj.Number, addrObj.Locality, addrObj.County)

	// 3. Extragem primul cod CAEN (sau poți trimite tot array-ul joined dacă ai nevoie)
	var primaryCaen string
	if len(apiResp.Data.AuthorizedCaenCodes) > 0 {
		primaryCaen = apiResp.Data.AuthorizedCaenCodes[0]
	}

	info := &CompanyInfo{
		Name:     companyName,
		Address:  fullAddress,
		CaenCode: primaryCaen,
		IsActive: isActive,
	}

	return info, nil
}
