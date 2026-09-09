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

const icaVerificationURL = "https://ica.ro/api/v1/verifica/cui/%s"

type CompanyInfo struct {
	Name     string
	IsActive bool
	CaenCode string
	Address  string
}

type ICAResponse struct {
	OK   bool `json:"ok"`
	Data struct {
		Denumire          string `json:"denumire"`
		Adresa            string `json:"adresa"`
		CodCAEN           string `json:"codCAEN"`
		StareInregistrare string `json:"stareInregistrare"`
		Inactiv           bool   `json:"inactiv"`
	} `json:"data"`
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// Lookup verifies a Romanian company through ICA's public CUI verification endpoint.
// ICA obtains the fiscal status live from ANAF and publishes company identity data from
// official sources. The submitted company name is intentionally not trusted: the official
// name returned by ICA is stored instead.
func Lookup(ctx context.Context, cuiRaw string, _ string) (*CompanyInfo, error) {
	cui := strings.TrimSpace(strings.ToUpper(cuiRaw))
	cui = strings.TrimPrefix(cui, "RO")

	if cui == "" {
		return nil, fmt.Errorf("CUI-ul nu poate fi gol")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf(icaVerificationURL, cui), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create ICA request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "SpottrOnboardingBackend/1.0")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to ICA company verification: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read ICA response: %w", err)
	}

	var apiResp ICAResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to decode ICA response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		if apiResp.Error.Message != "" {
			return nil, fmt.Errorf("ICA verification failed: %s", apiResp.Error.Message)
		}
		return nil, fmt.Errorf("ICA verification returned status code %d", resp.StatusCode)
	}
	if !apiResp.OK {
		if apiResp.Error.Message != "" {
			return nil, fmt.Errorf("ICA verification failed: %s", apiResp.Error.Message)
		}
		return nil, fmt.Errorf("ICA returned an unsuccessful verification response")
	}

	name := strings.TrimSpace(apiResp.Data.Denumire)
	if name == "" {
		return nil, fmt.Errorf("ICA returned no company name for this CUI")
	}

	return &CompanyInfo{
		Name:     name,
		Address:  strings.TrimSpace(apiResp.Data.Adresa),
		CaenCode: strings.TrimSpace(apiResp.Data.CodCAEN),
		// ICA's inactiv field is the live ANAF indicator. The registration text is
		// informational and varies by company, so it must not block an active firm.
		IsActive: !apiResp.Data.Inactiv,
	}, nil
}
