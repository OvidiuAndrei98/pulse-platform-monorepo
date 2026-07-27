"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, Loader2, MapPin, ScanLine, ShieldAlert, Ticket, XCircle } from "lucide-react";
import { QrCameraScanner } from "@/components/tickets/QrCameraScanner";
import { useTranslation } from "react-i18next";

type ScannerSession = {
  sessionToken: string;
  label: string;
  eventTitle: string;
  locationName: string;
  expiresAt: string;
};

type TicketValidation = {
  status: "valid" | "already_validated";
  ticketId: string;
  ticketType: string;
  eventTitle: string;
  validatedAt: string;
};

const apiRoot = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";
const scannerSessionKey = "pulse_scanner_session";

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Sesiunea de scanare nu este disponibila.");
  return body;
}

export default function ScanPage() {
  const { t } = useTranslation();
  const [session, setSession] = useState<ScannerSession>();
  const [loading, setLoading] = useState(true);
  const [validationHash, setValidationHash] = useState("");
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<TicketValidation>();
  const [error, setError] = useState("");

  useEffect(() => {
    async function initializeSession() {
      const query = new URLSearchParams(window.location.search);
      const accessToken = query.get("token");
      if (!accessToken) {
        const cached = window.sessionStorage.getItem(scannerSessionKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as ScannerSession;
            if (new Date(parsed.expiresAt) > new Date()) setSession(parsed);
            else window.sessionStorage.removeItem(scannerSessionKey);
          } catch {
            window.sessionStorage.removeItem(scannerSessionKey);
          }
        }
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${apiRoot}/ticket-validation/quick-access/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ token: accessToken }),
        });
        const created = await readJson(response) as ScannerSession;
        window.sessionStorage.setItem(scannerSessionKey, JSON.stringify(created));
        window.history.replaceState({}, "", "/scan");
        setSession(created);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Linkul de scanare este invalid.");
      } finally {
        setLoading(false);
      }
    }

    void initializeSession();
  }, []);

  const submitValidationHash = async (hash: string) => {
    if (!session || !hash.trim()) return;
    setValidating(true);
    setError("");
    setResult(undefined);
    try {
      const response = await fetch(`${apiRoot}/ticket-validation/quick-access/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${session.sessionToken}`,
        },
        body: JSON.stringify({ validationHash: hash.trim() }),
      });
      const validated = await readJson(response) as TicketValidation;
      setResult(validated);
      setValidationHash("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Biletul nu a putut fi validat.";
      setError(message);
      if (message.toLowerCase().includes("acces") || message.toLowerCase().includes("sesiun")) {
        window.sessionStorage.removeItem(scannerSessionKey);
        setSession(undefined);
      }
    } finally {
      setValidating(false);
    }
  };

  const validateTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    await submitValidationHash(validationHash);
  };

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-background text-foreground"><Loader2 className="h-6 w-6 animate-spin text-primary" /></main>;
  }

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
        <section className="w-full max-w-md rounded-xl border border-red-400/25 bg-red-400/[0.04] p-6 text-center">
          <ShieldAlert className="mx-auto h-7 w-7 text-red-300" />
          <h1 className="mt-4 text-lg font-bold">{t("scanner.sessionUnavailable")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error || t("scanner.openActiveLink")}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:py-10">
      <div className="mx-auto w-full max-w-xl space-y-5">
        <header className="rounded-xl border border-primary/25 bg-primary/[0.05] p-5">
          <div className="flex items-start gap-3"><div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/15 text-primary"><ScanLine className="h-5 w-5" /></div><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{session.label}</p><h1 className="mt-1 truncate text-xl font-bold">{session.eventTitle}</h1><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{session.locationName}</p></div></div>
        </header>

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex items-start gap-3"><Ticket className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="text-base font-semibold">{t("scanner.validateTicket")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("scanner.validationHint")}</p></div></div>
          <form onSubmit={validateTicket} className="mt-5 space-y-3">
            <textarea value={validationHash} onChange={(event) => setValidationHash(event.target.value)} rows={4} placeholder={t("scanner.qrCode")} className="w-full resize-none rounded-lg border border-white/15 bg-white/5 p-3 font-mono text-xs outline-none placeholder:font-sans placeholder:text-sm focus:border-primary/60" autoFocus />
            <QrCameraScanner disabled={validating} onScan={(value) => void submitValidationHash(value)} />
            <button type="submit" disabled={!validationHash.trim() || validating} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              {validating ? t("scanner.validating") : t("scanner.validate")}
            </button>
          </form>

          {result && <div className={`mt-5 flex gap-3 rounded-lg border p-4 ${result.status === "valid" ? "border-primary/30 bg-primary/10" : "border-amber-400/30 bg-amber-400/10"}`}>{result.status === "valid" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" /> : <XCircle className="mt-0.5 h-5 w-5 text-amber-300" />}<div><p className="text-sm font-semibold">{result.status === "valid" ? t("scanner.validTicket") : t("scanner.usedTicket")}</p><p className="mt-1 text-xs text-muted-foreground">{result.ticketType} - {result.eventTitle}</p></div></div>}
          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </section>
      </div>
    </main>
  );
}
