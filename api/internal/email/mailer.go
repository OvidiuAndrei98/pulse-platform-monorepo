package email

import (
	"context"
	"fmt"
	"net/smtp"
	"strings"
)

type Mailer struct {
	smtpHost     string
	smtpPort     string
	from         string
	username     string
	password     string
	publicAPIURL string
}

func NewMailer(host, port, from, username, password, publicAPIURL string) *Mailer {
	return &Mailer{
		smtpHost:     host,
		smtpPort:     port,
		from:         from,
		username:     username,
		password:     password,
		publicAPIURL: strings.TrimRight(publicAPIURL, "/"),
	}
}

func (m *Mailer) SendActivationEmail(ctx context.Context, toEmail, token string) error {
	activationLink := fmt.Sprintf("%s/api/v1/auth/activate?token=%s", m.publicAPIURL, token)

	headers := fmt.Sprintf(
		"From: %s\r\nSubject: Activeaza-ti contul Pulse\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n",
		m.from,
	)

	body := fmt.Sprintf(
		"<html><body><h3>Bun venit pe Pulse!</h3><p>Apasa pe linkul de mai jos pentru a-ti activa contul:</p><a href='%s'>Activeaza contul</a></body></html>",
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
	resetLink := fmt.Sprintf("%s/api/v1/auth/reset-password?token=%s", m.publicAPIURL, token)

	headers := fmt.Sprintf(
		"From: %s\r\nSubject: Reseteaza-ti parola Pulse\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n",
		m.from,
	)

	body := fmt.Sprintf(
		"<html><body><h3>Resetare parola Pulse</h3><p>Apasa pe linkul de mai jos:</p><a href='%s'>Reseteaza parola</a></body></html>",
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
