package invoicing

import (
	"errors"
	"math"
)

func resolveEventVATName(options []VATRateOption, percentage float64) (string, error) {
	name, found := "", false
	for _, option := range options {
		if math.Abs(option.Percentage-percentage) > 0.000001 {
			continue
		}
		if found && name != option.Name {
			return "", errors.New("mai multe regimuri TVA corespund cotei evenimentului; verificati configurarea facturarii")
		}
		name, found = option.Name, true
	}
	if !found {
		return "", errors.New("cota TVA a evenimentului nu este disponibila la operatorul de facturare")
	}
	return name, nil
}
