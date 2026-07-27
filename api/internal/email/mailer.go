package email

import (
	"context"
	"fmt"
	"html"
	"net/smtp"
	"strings"
)

type TicketDelivery struct {
	TicketTypeName string
	ValidationHash string
}

type Mailer struct {
	smtpHost     string
	smtpPort     string
	from         string
	username     string
	password     string
	publicAPIURL string
	publicAppURL string
}

func NewMailer(host, port, from, username, password, publicAPIURL, publicAppURL string) *Mailer {
	return &Mailer{
		smtpHost:     host,
		smtpPort:     port,
		from:         from,
		username:     username,
		password:     password,
		publicAPIURL: strings.TrimRight(publicAPIURL, "/"),
		publicAppURL: strings.TrimRight(publicAppURL, "/"),
	}
}

func (m *Mailer) SendActivationEmail(ctx context.Context, toEmail, token string) error {
	activationLink := fmt.Sprintf("%s/api/v1/auth/activate?token=%s", m.publicAPIURL, token)

	headers := fmt.Sprintf(
		"From: %s\r\nSubject: Activeaza-ti contul Glow\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n",
		m.from,
	)

	body := fmt.Sprintf(
		"<html><body><h3>Bun venit pe Glow!</h3><p>Apasa pe linkul de mai jos pentru a-ti activa contul:</p><a href='%s'>Activeaza contul</a></body></html>",
		activationLink,
	)

	msg := []byte(headers + body)
	addr := m.smtpHost + ":" + m.smtpPort

	var auth smtp.Auth
	// Generăm autentificarea DOAR dacă avem o parolă setată (de exemplu, în producție)
	if m.password != "" {
		auth = smtp.PlainAuth("", m.username, m.password, m.smtpHost)
	}

	// Trimiterea nativă prin SMTP
	err := smtp.SendMail(addr, auth, m.from, []string{toEmail}, msg)
	if err != nil {
		return fmt.Errorf("eroare trimitere email prin Mailpit: %w", err)
	}

	return nil
}

func (m *Mailer) SendPasswordResetEmail(ctx context.Context, toEmail, token string) error {
	// Modifică URL-ul pentru a bate spre endpoint-ul tău local de resetare a parolei
	resetLink := fmt.Sprintf("%s/reset-password?token=%s", m.publicAppURL, token)

	headers := fmt.Sprintf(
		"From: %s\r\nSubject: Reseteaza-ti parola Glow\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n",
		m.from,
	)

	body := fmt.Sprintf(
		"<html><body><h3>Resetare parola Glow</h3><p>Apasa pe linkul de mai jos:</p><a href='%s'>Reseteaza parola</a></body></html>",
		resetLink,
	)

	msg := []byte(headers + body)
	addr := m.smtpHost + ":" + m.smtpPort

	var auth smtp.Auth
	// Generăm autentificarea DOAR dacă avem o parolă setată (de exemplu, în producție)
	if m.password != "" {
		auth = smtp.PlainAuth("", m.username, m.password, m.smtpHost)
	}

	// Trimiterea nativă prin SMTP
	err := smtp.SendMail(addr, auth, m.from, []string{toEmail}, msg)
	if err != nil {
		return fmt.Errorf("eroare trimitere email prin Mailpit: %w", err)
	}

	return nil
}

func (m *Mailer) SendGuestTicketEmail(ctx context.Context, toEmail, eventTitle, locationName string, tickets []TicketDelivery) error {
	if len(tickets) == 0 {
		return nil
	}

	var ticketRows strings.Builder
	for index, ticket := range tickets {
		ticketRows.WriteString(fmt.Sprintf(
			"<tr><td style='padding:12px;border-top:1px solid #e5e7eb'><strong>Bilet %d - %s</strong><br><code style='display:inline-block;margin-top:8px;padding:8px;background:#f3f4f6;color:#111827'>%s</code></td></tr>",
			index+1,
			html.EscapeString(ticket.TicketTypeName),
			html.EscapeString(ticket.ValidationHash),
		))
	}

	headers := fmt.Sprintf(
		"From: %s\r\nSubject: Biletele tale pentru %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n",
		m.from,
		html.EscapeString(eventTitle),
	)
	body := fmt.Sprintf(
		"<html><body style='font-family:Arial,sans-serif;color:#111827'><h2>Plata a fost confirmata</h2><p>Mai jos gasesti biletele pentru <strong>%s</strong>.</p><p>Locatie: %s</p><table width='100%%' cellspacing='0' cellpadding='0'>%s</table><p style='margin-top:24px;color:#4b5563'>Pastreaza acest email. Poti crea un cont Glow cu aceeasi adresa de email pentru a vedea biletele si in aplicatie.</p></body></html>",
		html.EscapeString(eventTitle),
		html.EscapeString(locationName),
		ticketRows.String(),
	)

	var auth smtp.Auth
	if m.password != "" {
		auth = smtp.PlainAuth("", m.username, m.password, m.smtpHost)
	}
	if err := smtp.SendMail(m.smtpHost+":"+m.smtpPort, auth, m.from, []string{toEmail}, []byte(headers+body)); err != nil {
		return fmt.Errorf("eroare trimitere email bilete: %w", err)
	}
	return nil
}
