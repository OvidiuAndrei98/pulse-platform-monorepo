package email

import (
	"context"
	"fmt"
	"net/smtp"
)

type Mailer struct {
	smtpHost string
	smtpPort string
	from     string
	password string
}

func NewMailer(host, port, from, password string) *Mailer {
	return &Mailer{
		smtpHost: host,
		smtpPort: port,
		from:     from,
		password: password,
	}
}

func (m *Mailer) SendActivationEmail(ctx context.Context, toEmail, token string) error {
	// Modifică URL-ul pentru a bate spre endpoint-ul tău local de activare
	activationLink := fmt.Sprintf("http://localhost:8080/api/v1/auth/activate?token=%s", token)

	subject := "Subject: Activează-ți contul Pulse\n"
	mime := "MIME-version: 1.0;\nContent-Type: text/html; charset=\"UTF-8\";\n\n"
	body := fmt.Sprintf("<html><body><h3>Bun venit pe Pulse!</h3><p>Apasă pe linkul de mai jos pentru a-ți activa contul:</p><a href='%s'>Activează Cont</a></body></html>", activationLink)

	msg := []byte(subject + mime + body)
	addr := m.smtpHost + ":" + m.smtpPort

	var auth smtp.Auth
	// Generăm autentificarea DOAR dacă avem o parolă setată (de exemplu, în producție)
	if m.password != "" {
		auth = smtp.PlainAuth("", m.from, m.password, m.smtpHost)
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
	resetLink := fmt.Sprintf("http://localhost:8080/api/v1/auth/reset-password?token=%s", token)

	subject := "Subject: Resetează-ți parola Pulse\n"
	mime := "MIME-version: 1.0;\nContent-Type: text/html; charset=\"UTF-8\";\n\n"
	body := fmt.Sprintf("<html><body><h3>Bun venit pe Pulse!</h3><p>Apasă pe linkul de mai jos pentru a-ți reseta parola:</p><a href='%s'>Resetează Parola</a></body></html>", resetLink)

	msg := []byte(subject + mime + body)
	addr := m.smtpHost + ":" + m.smtpPort

	var auth smtp.Auth
	// Generăm autentificarea DOAR dacă avem o parolă setată (de exemplu, în producție)
	if m.password != "" {
		auth = smtp.PlainAuth("", m.from, m.password, m.smtpHost)
	}

	// Trimiterea nativă prin SMTP
	err := smtp.SendMail(addr, auth, m.from, []string{toEmail}, msg)
	if err != nil {
		return fmt.Errorf("eroare trimitere email prin Mailpit: %w", err)
	}

	return nil
}
