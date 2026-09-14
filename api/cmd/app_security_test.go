package app

import (
	"net/url"
	"os"
	"strings"
	"testing"
)

func TestInitApplicationRejectsUnsafeJWTBeforeDatabase(t *testing.T) {
	// No database/server/email configuration is needed to reject unsafe startup.
	for _, secret := range []string{"", "short", strings.Repeat("change-me", 5)} {
		t.Setenv("JWT_SECRET", secret)
		application, err := InitApplication()
		if application != nil || err == nil || !strings.Contains(err.Error(), "JWT_SECRET") {
			t.Fatal("unsafe startup did not fail at JWT validation")
		}
	}
}

func setSafeDatabaseTestEnvironment(t *testing.T) {
	t.Helper()
	t.Setenv("DB_HOST", "localhost")
	t.Setenv("DB_PORT", "5432")
	t.Setenv("DB_USER", "spottr_test")
	t.Setenv("DB_PASSWORD", "local-test-password-32-bytes-long")
	t.Setenv("DB_NAME", "spottr_security_test")
	t.Setenv("DB_SSLMODE", "")
	t.Setenv("DB_SSLROOTCERT", "")
}

func TestDatabaseSettingsRejectMissingAndPlaceholderPasswords(t *testing.T) {
	for _, password := range []string{"", "short", "dbpassword-must-not-be-used", "change-me-change-me"} {
		t.Run(password, func(t *testing.T) {
			setSafeDatabaseTestEnvironment(t)
			t.Setenv("DB_PASSWORD", password)
			if _, err := loadDatabaseSettings(); err == nil || !strings.Contains(err.Error(), "DB_PASSWORD") {
				t.Fatalf("unsafe password was accepted: %q", password)
			}
		})
	}
}

func TestDatabaseSettingsAllowLocalLoopbackWithoutTLS(t *testing.T) {
	for _, host := range []string{"localhost", "127.0.0.1", "127.42.10.9", "::1", "[::1]"} {
		t.Run(host, func(t *testing.T) {
			setSafeDatabaseTestEnvironment(t)
			t.Setenv("DB_HOST", host)
			settings, err := loadDatabaseSettings()
			if err != nil {
				t.Fatal(err)
			}
			if settings.sslMode != "disable" {
				t.Fatalf("local ssl mode = %q, want disable", settings.sslMode)
			}
			parsed, err := url.Parse(databaseConnectionURL(settings))
			if err != nil || parsed.Hostname() == "" {
				t.Fatalf("invalid local database URL for host %q: url=%q err=%v", host, databaseConnectionURL(settings), err)
			}
		})
	}
}

func TestDatabaseSettingsRequireVerifiedTLSForRemoteHosts(t *testing.T) {
	for _, sslMode := range []string{"", "disable", "allow", "prefer", "require", "verify-ca"} {
		t.Run("mode_"+sslMode, func(t *testing.T) {
			setSafeDatabaseTestEnvironment(t)
			t.Setenv("DB_HOST", "pulse-db.example.invalid")
			t.Setenv("DB_SSLMODE", sslMode)
			if _, err := loadDatabaseSettings(); err == nil {
				t.Fatalf("remote database accepted sslmode %q", sslMode)
			}
		})
	}

	setSafeDatabaseTestEnvironment(t)
	t.Setenv("DB_HOST", "pulse-db.example.invalid")
	t.Setenv("DB_SSLMODE", "verify-full")
	certificatePath := t.TempDir() + "/rds-ca.pem"
	if err := os.WriteFile(certificatePath, []byte("test certificate placeholder"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DB_SSLROOTCERT", certificatePath)
	settings, err := loadDatabaseSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.sslMode != "verify-full" || settings.sslRootCert != certificatePath {
		t.Fatalf("verified remote settings were not retained: %+v", settings)
	}
}

func TestDatabaseConnectionURLEscapesCredentials(t *testing.T) {
	setSafeDatabaseTestEnvironment(t)
	password := "S3cure:@/?#[]%-password"
	t.Setenv("DB_PASSWORD", password)
	settings, err := loadDatabaseSettings()
	if err != nil {
		t.Fatal(err)
	}
	connectionURL := databaseConnectionURL(settings)
	if strings.Contains(connectionURL, password) {
		t.Fatal("database password was not URL-escaped")
	}
	parsed, err := url.Parse(connectionURL)
	if err != nil {
		t.Fatal(err)
	}
	parsedPassword, ok := parsed.User.Password()
	if !ok || parsedPassword != password {
		t.Fatal("escaped database password does not round-trip")
	}
}

func TestDatabaseConfigurationErrorsDoNotLeakPassword(t *testing.T) {
	setSafeDatabaseTestEnvironment(t)
	password := "do-not-log-this-secret-123"
	t.Setenv("DB_PASSWORD", password)
	t.Setenv("DB_HOST", "pulse-db.example.invalid")
	t.Setenv("DB_SSLMODE", "verify-full")
	t.Setenv("DB_SSLROOTCERT", "missing-rds-ca.pem")
	_, err := loadDatabaseSettings()
	if err == nil || strings.Contains(err.Error(), password) {
		t.Fatalf("unsafe database configuration error: %v", err)
	}
}
