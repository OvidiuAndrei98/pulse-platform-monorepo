package email

import (
	"context"
	"fmt"
	"html"
	"mime"
	"net/mail"
	"net/smtp"
	"net/url"
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
		smtpHost:     strings.TrimSpace(host),
		smtpPort:     strings.TrimSpace(port),
		from:         strings.TrimSpace(from),
		username:     strings.TrimSpace(username),
		password:     password,
		publicAPIURL: strings.TrimRight(publicAPIURL, "/"),
		publicAppURL: strings.TrimRight(publicAppURL, "/"),
	}
}

func (m *Mailer) SendActivationEmail(ctx context.Context, toEmail, token string) error {
	activationLink := fmt.Sprintf("%s/api/v1/auth/activate?token=%s", m.publicAPIURL, url.QueryEscape(token))
	content := fmt.Sprintf(
		`<p style="margin:0 0 18px;color:#b8b8b8;font-size:15px;line-height:1.65">Bun venit pe Spottr. Confirmă adresa de email pentru a-ți activa contul.</p>
<a href="%s" style="display:inline-block;border-radius:999px;background:#ff3344;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px">Activează contul</a>
<p style="margin:22px 0 0;color:#777;font-size:12px;line-height:1.6">Dacă nu ai creat acest cont, poți ignora mesajul.</p>`,
		html.EscapeString(activationLink),
	)
	return m.sendHTML(ctx, toEmail, "Activeaza-ti contul Spottr", "Confirmă adresa de email pentru contul Spottr.", "Activează-ți contul", content)
}

func (m *Mailer) SendPasswordResetEmail(ctx context.Context, toEmail, token string) error {
	resetLink := fmt.Sprintf("%s/reset-password?token=%s", m.publicAppURL, url.QueryEscape(token))
	content := fmt.Sprintf(
		`<p style="margin:0 0 18px;color:#b8b8b8;font-size:15px;line-height:1.65">Am primit o solicitare de resetare a parolei contului tău Spottr.</p>
<a href="%s" style="display:inline-block;border-radius:999px;background:#ff3344;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px">Resetează parola</a>
<p style="margin:22px 0 0;color:#777;font-size:12px;line-height:1.6">Dacă nu ai cerut resetarea parolei, nu trebuie să faci nimic.</p>`,
		html.EscapeString(resetLink),
	)
	return m.sendHTML(ctx, toEmail, "Reseteaza parola contului Spottr", "Ai solicitat resetarea parolei Spottr.", "Resetare parolă", content)
}

func (m *Mailer) SendTicketConfirmationEmail(ctx context.Context, toEmail, eventTitle, locationName string, hasAccount bool, tickets []TicketDelivery) error {
	if len(tickets) == 0 {
		return nil
	}

	var ticketCards strings.Builder
	for index, ticket := range tickets {
		ticketCards.WriteString(fmt.Sprintf(
			`<div style="margin-top:12px;border:1px solid #2b2b2b;border-radius:16px;background:#111;padding:16px">
<div style="color:#ff3344;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Bilet %d</div>
<div style="margin-top:7px;color:#fff;font-size:15px;font-weight:700">%s</div>
<div style="margin-top:12px;color:#888;font-size:11px">Cod unic de acces</div>
<div style="margin-top:5px;border-radius:10px;background:#080808;padding:10px;color:#ddd;font-family:monospace;font-size:11px;line-height:1.55;word-break:break-all">%s</div>
</div>`,
			index+1,
			html.EscapeString(ticket.TicketTypeName),
			html.EscapeString(ticket.ValidationHash),
		))
	}

	buttonLabel := "Creează cont Spottr"
	buttonURL := m.publicAppURL + "/register"
	accountHint := "Creează un cont Spottr cu aceeași adresă de email, iar biletele vor fi asociate automat contului."
	if hasAccount {
		buttonLabel = "Vezi biletele în Spottr"
		buttonURL = m.publicAppURL + "/users/me/tickets"
		accountHint = "Codurile QR pentru acces sunt disponibile și în secțiunea Biletele tale din Spottr."
	}

	content := fmt.Sprintf(
		`<div style="margin-bottom:20px;border-radius:16px;background:#111;padding:18px">
<div style="color:#ff3344;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Plată confirmată</div>
<div style="margin-top:8px;color:#fff;font-size:20px;font-weight:800;line-height:1.3">%s</div>
<div style="margin-top:7px;color:#999;font-size:14px">%s</div>
</div>
<p style="margin:0;color:#b8b8b8;font-size:14px;line-height:1.65">Biletele tale sunt pregătite. Păstrează acest mesaj și nu distribui codurile de acces.</p>
%s
<p style="margin:20px 0 14px;color:#999;font-size:13px;line-height:1.6">%s</p>
<a href="%s" style="display:inline-block;border-radius:999px;background:#ff3344;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px">%s</a>
<p style="margin:22px 0 0;border-top:1px solid #252525;padding-top:16px;color:#777;font-size:12px;line-height:1.6">Factura fiscală este emisă și trimisă separat de operatorul de facturare al organizatorului.</p>`,
		html.EscapeString(eventTitle),
		html.EscapeString(locationName),
		ticketCards.String(),
		html.EscapeString(accountHint),
		html.EscapeString(buttonURL),
		html.EscapeString(buttonLabel),
	)

	return m.sendHTML(
		ctx,
		toEmail,
		"Biletele tale pentru "+sanitizeHeader(eventTitle),
		"Plata a fost confirmată, iar biletele tale sunt pregătite.",
		"Biletele tale sunt pregătite",
		content,
	)
}

func (m *Mailer) sendHTML(ctx context.Context, toEmail, subject, preheader, title, content string) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	if m.smtpHost == "" || m.smtpPort == "" {
		return fmt.Errorf("configuratia SMTP este incompleta")
	}

	sender, err := mail.ParseAddress(m.from)
	if err != nil {
		return fmt.Errorf("adresa SMTP_FROM este invalida: %w", err)
	}
	if sender.Name == "" {
		sender.Name = "SPOTTR"
	}
	recipient, err := mail.ParseAddress(strings.TrimSpace(toEmail))
	if err != nil {
		return fmt.Errorf("adresa destinatarului este invalida: %w", err)
	}

	body := emailLayout(preheader, title, content)
	headers := fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n",
		sender.String(),
		recipient.String(),
		mime.QEncoding.Encode("UTF-8", sanitizeHeader(subject)),
	)

	var auth smtp.Auth
	if m.password != "" {
		auth = smtp.PlainAuth("", m.username, m.password, m.smtpHost)
	}
	if err := smtp.SendMail(m.smtpHost+":"+m.smtpPort, auth, sender.Address, []string{recipient.Address}, []byte(headers+body)); err != nil {
		return fmt.Errorf("eroare trimitere email Spottr: %w", err)
	}
	return nil
}

func emailLayout(preheader, title, content string) string {
	return fmt.Sprintf(
		`<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#080808;color:#fff;font-family:Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">%s</div>
<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#080808"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:580px;border:1px solid #242424;border-radius:22px;background:#0d0d0d;overflow:hidden">
<tr><td style="padding:24px 24px 18px;border-bottom:1px solid #242424"><div style="color:#fff;font-size:18px;font-weight:900;letter-spacing:.24em">SPOTTR<span style="color:#ff3344">.</span></div></td></tr>
<tr><td style="padding:26px 24px"><h1 style="margin:0 0 18px;color:#fff;font-size:26px;line-height:1.2">%s</h1>%s</td></tr>
<tr><td style="padding:18px 24px;border-top:1px solid #242424;color:#666;font-size:11px">spottr.ro</td></tr>
</table></td></tr></table></body></html>`,
		html.EscapeString(preheader),
		html.EscapeString(title),
		content,
	)
}

func sanitizeHeader(value string) string {
	return strings.TrimSpace(strings.NewReplacer("\r", " ", "\n", " ").Replace(value))
}
