package email

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"html"
	"mime"
	"mime/multipart"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"net/url"
	"strings"
	"time"

	qrcode "github.com/skip2/go-qrcode"
)

type TicketDelivery struct {
	ID             string
	StartTime      time.Time
	TicketTypeName string
	ValidationHash string
}

type inlineImage struct {
	contentID string
	filename  string
	data      []byte
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
<a href="%s" style="display:inline-block;border-radius:999px;background:#ff0044;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px">Activează contul</a>
<p style="margin:22px 0 0;color:#777;font-size:12px;line-height:1.6">Dacă nu ai creat acest cont, poți ignora mesajul.</p>`,
		html.EscapeString(activationLink),
	)
	return m.sendHTML(ctx, toEmail, "Activeaza-ti contul Spottr", "Confirmă adresa de email pentru contul Spottr.", "Activează-ți contul", content)
}

func (m *Mailer) SendPasswordResetEmail(ctx context.Context, toEmail, token string) error {
	resetLink := fmt.Sprintf("%s/reset-password?token=%s", m.publicAppURL, url.QueryEscape(token))
	content := fmt.Sprintf(
		`<p style="margin:0 0 18px;color:#b8b8b8;font-size:15px;line-height:1.65">Am primit o solicitare de resetare a parolei contului tău Spottr.</p>
<a href="%s" style="display:inline-block;border-radius:999px;background:#ff0044;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px">Resetează parola</a>
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
	inlineImages := make([]inlineImage, 0, len(tickets))
	for index, ticket := range tickets {
		qrPNG, err := qrcode.Encode(ticket.ValidationHash, qrcode.Medium, 256)
		if err != nil {
			return fmt.Errorf("codul QR pentru bilet nu a putut fi generat: %w", err)
		}
		contentID := fmt.Sprintf("spottr-ticket-%d", index+1)
		inlineImages = append(inlineImages, inlineImage{
			contentID: contentID,
			filename:  fmt.Sprintf("spottr-ticket-%d.png", index+1),
			data:      qrPNG,
		})
		ticketCards.WriteString(`<div style="margin-top:20px">`)
		ticketCards.WriteString(renderTicketCard(ticket, eventTitle, locationName, contentID))
		// Keep the existing manual-entry fallback outside the visual ticket.
		ticketCards.WriteString(fmt.Sprintf(`<div style="max-width:440px;margin:10px auto 0;color:#999;font-size:10px;line-height:1.6;word-break:break-all">Cod de acces alternativ<br>%s</div></div>`, html.EscapeString(ticket.ValidationHash)))
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
<div style="color:#ff0044;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Plată confirmată</div>
<div style="margin-top:8px;color:#fff;font-size:20px;font-weight:800;line-height:1.3">%s</div>
<div style="margin-top:7px;color:#999;font-size:14px">%s</div>
</div>
<p style="margin:0;color:#b8b8b8;font-size:14px;line-height:1.65">Biletele tale sunt pregătite. Păstrează acest mesaj și nu distribui codurile de acces.</p>
%s
<p style="margin:20px 0 14px;color:#999;font-size:13px;line-height:1.6">%s</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#ff0044" style="border-radius:999px;background:#ff0044"><a href="%s" style="display:inline-block;border-radius:999px;background:#ff0044;color:#ffffff!important;-webkit-text-fill-color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px"><span style="color:#ffffff!important;-webkit-text-fill-color:#ffffff">%s</span></a></td></tr></table>
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
		inlineImages...,
	)
}

func (m *Mailer) sendHTML(ctx context.Context, toEmail, subject, preheader, title, content string, inlineImages ...inlineImage) error {
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

	message, err := buildEmailMessage(*sender, *recipient, subject, emailLayout(preheader, title, content), inlineImages)
	if err != nil {
		return fmt.Errorf("mesajul email Spottr nu a putut fi construit: %w", err)
	}

	var auth smtp.Auth
	if m.password != "" {
		auth = smtp.PlainAuth("", m.username, m.password, m.smtpHost)
	}
	if err := smtp.SendMail(m.smtpHost+":"+m.smtpPort, auth, sender.Address, []string{recipient.Address}, message); err != nil {
		return fmt.Errorf("eroare trimitere email Spottr: %w", err)
	}
	return nil
}

func buildEmailMessage(sender, recipient mail.Address, subject, body string, inlineImages []inlineImage) ([]byte, error) {
	var message bytes.Buffer
	fmt.Fprintf(
		&message,
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\n",
		sender.String(),
		recipient.String(),
		mime.QEncoding.Encode("UTF-8", sanitizeHeader(subject)),
	)

	if len(inlineImages) == 0 {
		message.WriteString("Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n")
		message.WriteString(body)
		return message.Bytes(), nil
	}

	related := multipart.NewWriter(&message)
	fmt.Fprintf(&message, "Content-Type: multipart/related; boundary=%q\r\n\r\n", related.Boundary())

	htmlHeaders := make(textproto.MIMEHeader)
	htmlHeaders.Set("Content-Type", "text/html; charset=UTF-8")
	htmlHeaders.Set("Content-Transfer-Encoding", "base64")
	htmlPart, err := related.CreatePart(htmlHeaders)
	if err != nil {
		return nil, err
	}
	if _, err := htmlPart.Write([]byte(encodeMIMEBase64([]byte(body)))); err != nil {
		return nil, err
	}

	for _, image := range inlineImages {
		imageHeaders := make(textproto.MIMEHeader)
		imageHeaders.Set("Content-Type", "image/png; name="+mime.QEncoding.Encode("UTF-8", image.filename))
		imageHeaders.Set("Content-Transfer-Encoding", "base64")
		imageHeaders.Set("Content-ID", "<"+sanitizeHeader(image.contentID)+">")
		imageHeaders.Set("Content-Disposition", "inline; filename="+mime.QEncoding.Encode("UTF-8", image.filename))
		imagePart, err := related.CreatePart(imageHeaders)
		if err != nil {
			return nil, err
		}
		if _, err := imagePart.Write([]byte(encodeMIMEBase64(image.data))); err != nil {
			return nil, err
		}
	}

	if err := related.Close(); err != nil {
		return nil, err
	}
	return message.Bytes(), nil
}

func encodeMIMEBase64(data []byte) string {
	encoded := base64.StdEncoding.EncodeToString(data)
	var wrapped strings.Builder
	for len(encoded) > 76 {
		wrapped.WriteString(encoded[:76])
		wrapped.WriteString("\r\n")
		encoded = encoded[76:]
	}
	wrapped.WriteString(encoded)
	wrapped.WriteString("\r\n")
	return wrapped.String()
}

func emailLayout(preheader, title, content string) string {
	return fmt.Sprintf(
		`<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#080808;color:#fff;font-family:Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">%s</div>
<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#080808"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:580px;border:1px solid #242424;border-radius:22px;background:#0d0d0d;overflow:hidden">
<tr><td style="padding:24px 24px 18px;border-bottom:1px solid #242424"><div style="color:#fff;font-size:18px;font-weight:900;letter-spacing:.24em">SPOTTR<span style="color:#ff0044">.</span></div></td></tr>
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
