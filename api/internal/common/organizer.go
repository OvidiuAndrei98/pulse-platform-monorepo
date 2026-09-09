package common

import (
	"errors"
	"strings"
	"unicode"
)

func NormalizeOrganizerDetails(cuiRaw, companyNameRaw string) (string, string, error) {
	cui, err := NormalizeCUI(cuiRaw)
	if err != nil {
		return "", "", err
	}

	companyName := strings.Join(strings.Fields(companyNameRaw), " ")
	if len([]rune(companyName)) < 2 || len([]rune(companyName)) > 255 {
		return "", "", errors.New("Numele firmei trebuie sa contina intre 2 si 255 de caractere")
	}

	return cui, companyName, nil
}

func NormalizeCUI(cuiRaw string) (string, error) {
	cui := strings.ToUpper(strings.TrimSpace(cuiRaw))
	cui = strings.ReplaceAll(cui, " ", "")
	cui = strings.TrimPrefix(cui, "RO")
	if len(cui) < 2 || len(cui) > 10 {
		return "", errors.New("CUI-ul trebuie sa contina intre 2 si 10 cifre")
	}
	for _, character := range cui {
		if !unicode.IsDigit(character) {
			return "", errors.New("CUI-ul poate contine doar cifre, optional precedate de RO")
		}
	}
	return cui, nil
}
