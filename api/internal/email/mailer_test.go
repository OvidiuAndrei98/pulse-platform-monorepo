package email

import (
	"encoding/base64"
	"io"
	"mime"
	"mime/multipart"
	"net/mail"
	"strings"
	"testing"
)

func TestEmailLayoutUsesSpottrBrandAndEscapesDynamicText(t *testing.T) {
	result := emailLayout("preview <unsafe>", "title <unsafe>", "<p>trusted content</p>")
	for _, expected := range []string{"SPOTTR", "spottr.ro", "preview &lt;unsafe&gt;", "title &lt;unsafe&gt;", "<p>trusted content</p>"} {
		if !strings.Contains(result, expected) {
			t.Fatalf("email layout does not contain %q", expected)
		}
	}
	if strings.Contains(result, "Glow") {
		t.Fatal("legacy brand found in email layout")
	}
}

func TestSanitizeHeaderRemovesLineBreaks(t *testing.T) {
	if got := sanitizeHeader("Event\r\nBcc: attacker@example.com"); got != "Event  Bcc: attacker@example.com" {
		t.Fatalf("sanitizeHeader() = %q", got)
	}
}

func TestBuildEmailMessageEmbedsInlineTicketQR(t *testing.T) {
	message, err := buildEmailMessage(
		mail.Address{Name: "SPOTTR", Address: "hello@spottr.ro"},
		mail.Address{Address: "buyer@example.com"},
		"Bilet Spottr",
		`<html><body><img src="cid:spottr-ticket-1"><a style="color:#ffffff!important">Bilet</a></body></html>`,
		[]inlineImage{{contentID: "spottr-ticket-1", filename: "ticket.png", data: []byte("png-data")}},
	)
	if err != nil {
		t.Fatalf("buildEmailMessage() error = %v", err)
	}

	parsed, err := mail.ReadMessage(strings.NewReader(string(message)))
	if err != nil {
		t.Fatalf("mail.ReadMessage() error = %v", err)
	}
	mediaType, params, err := mime.ParseMediaType(parsed.Header.Get("Content-Type"))
	if err != nil || mediaType != "multipart/related" {
		t.Fatalf("Content-Type = %q, params=%v, err=%v", mediaType, params, err)
	}

	reader := multipart.NewReader(parsed.Body, params["boundary"])
	htmlPart, err := reader.NextPart()
	if err != nil {
		t.Fatalf("reading HTML part: %v", err)
	}
	htmlBody, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, htmlPart))
	if err != nil {
		t.Fatalf("decoding HTML part: %v", err)
	}
	if !strings.Contains(string(htmlBody), `src="cid:spottr-ticket-1"`) {
		t.Fatalf("HTML does not reference inline QR: %s", htmlBody)
	}

	imagePart, err := reader.NextPart()
	if err != nil {
		t.Fatalf("reading QR part: %v", err)
	}
	if imagePart.Header.Get("Content-ID") != "<spottr-ticket-1>" {
		t.Fatalf("Content-ID = %q", imagePart.Header.Get("Content-ID"))
	}
	imageData, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, imagePart))
	if err != nil {
		t.Fatalf("decoding QR part: %v", err)
	}
	if string(imageData) != "png-data" {
		t.Fatalf("QR payload = %q", imageData)
	}
}
