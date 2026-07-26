"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Loader2,
  Link2,
  MailPlus,
  ScanLine,
  ShieldCheck,
  Ticket,
  Trash2,
  UserRoundCheck,
  UsersRound,
  XCircle,
} from "lucide-react";
import { ApiClient, ReadableSchema } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";
import { OrganizerProfile } from "@/core/DataProvider";
import { QrCameraScanner } from "@/components/tickets/QrCameraScanner";

const ORGANIZER_AGREEMENT_VERSION = "2026-07-27";

type ValidationEvent = ReadableSchema<"ValidationEventResponse">;
type ValidationStaff = ReadableSchema<"ValidationStaffResponse">;
type TicketValidation = ReadableSchema<"TicketValidationResponse">;
type ScannerAccess = ReadableSchema<"ScannerAccessResponse">;
type CreatedScannerAccess = ReadableSchema<"CreateScannerAccessResponse">;

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function TicketValidationPage() {
  const { user } = useDataProvider();
  const isOrganizer = user?.properties.role === "organizer" || user?.properties.role === "admin";
  const [profile, setProfile] = useState<OrganizerProfile>();
  const [profileLoading, setProfileLoading] = useState(isOrganizer);
  const [companyName, setCompanyName] = useState("");
  const [cui, setCui] = useState("");
  const [submittingProfile, setSubmittingProfile] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [events, setEvents] = useState<ValidationEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventMenuOpen, setEventMenuOpen] = useState(false);
  const [validationHash, setValidationHash] = useState("");
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<TicketValidation>();
  const [staff, setStaff] = useState<ValidationStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffEmail, setStaffEmail] = useState("");
  const [savingStaff, setSavingStaff] = useState(false);
  const [scannerAccesses, setScannerAccesses] = useState<ScannerAccess[]>([]);
  const [scannerAccessLoading, setScannerAccessLoading] = useState(false);
  const [scannerLabel, setScannerLabel] = useState("Gate 1 Scanner");
  const [scannerStartsAt, setScannerStartsAt] = useState("");
  const [scannerEndsAt, setScannerEndsAt] = useState("");
  const [creatingScannerAccess, setCreatingScannerAccess] = useState(false);
  const [latestScannerAccess, setLatestScannerAccess] = useState<CreatedScannerAccess>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedEventIdRef = useRef(selectedEventId);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId),
    [events, selectedEventId],
  );

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  const loadStaff = async (eventId: string) => {
    setStaffLoading(true);
    try {
      const response = await ApiClient.instance.get(
        "/dashboard/ticket-validation/events/{id}/staff",
        { params: { path: { id: eventId } } },
      );
      if (selectedEventIdRef.current === eventId) setStaff(response);
    } catch {
      setError("Lista validatorilor nu a putut fi incarcata.");
    } finally {
      setStaffLoading(false);
    }
  };

  const loadScannerAccesses = async (eventId: string) => {
    setScannerAccessLoading(true);
    try {
      const response = await ApiClient.instance.get(
        "/dashboard/ticket-validation/events/{id}/quick-access",
        { params: { path: { id: eventId } } },
      );
      if (selectedEventIdRef.current === eventId) setScannerAccesses(response);
    } catch {
      setError("Linkurile temporare nu au putut fi incarcate.");
    } finally {
      setScannerAccessLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setEventsLoading(true);
      try {
        const response = await ApiClient.instance.get("/dashboard/ticket-validation/events");
        if (cancelled) return;
        setEvents(response);
        setSelectedEventId((current) => current || response[0]?.id || "");
      } catch {
        if (!cancelled) setError("Evenimentele pentru validare nu au putut fi incarcate.");
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !isOrganizer) {
      setProfileLoading(false);
      return;
    }
    const currentUser = user;

    async function loadProfile() {
      setProfileLoading(true);
      try {
        setProfile(await currentUser.getOrganizerProfile());
      } catch {
        setProfile(undefined);
      } finally {
        setProfileLoading(false);
      }
    }

    void loadProfile();
  }, [isOrganizer, user]);

  useEffect(() => {
    setStaff([]);
    setStaffEmail("");
    setScannerAccesses([]);
    setLatestScannerAccess(undefined);
    if (!selectedEvent?.canManage) return;
    setScannerStartsAt(toDateTimeLocal(selectedEvent.startTime));
    setScannerEndsAt(toDateTimeLocal(selectedEvent.endTime));
    void loadStaff(selectedEvent.id);
    void loadScannerAccesses(selectedEvent.id);
  }, [selectedEvent?.canManage, selectedEvent?.id]);

  const submitCompany = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !cui.trim() || !companyName.trim() || !agreementAccepted) return;
    setSubmittingProfile(true);
    setError("");
    try {
      setProfile(await user.updateOrganizerProfile(cui.trim(), companyName.trim(), ORGANIZER_AGREEMENT_VERSION));
      setNotice("Datele firmei au fost trimise pentru verificare.");
    } catch {
      setError("Firma nu a putut fi verificata. Verifica datele introduse.");
    } finally {
      setSubmittingProfile(false);
    }
  };

  const submitValidationHash = async (hash: string) => {
    if (!selectedEventId || !hash.trim()) return;
    setValidating(true);
    setError("");
    setNotice("");
    setResult(undefined);
    try {
      const response = await ApiClient.instance.post(
        "/dashboard/ticket-validation/events/{id}/tickets/validate",
        {
          params: { path: { id: selectedEventId } },
          body: { validationHash: hash.trim() },
        },
      );
      setResult(response);
      setValidationHash("");
    } catch {
      setError("Biletul este invalid sau nu apartine evenimentului selectat.");
    } finally {
      setValidating(false);
    }
  };

  const validateTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    await submitValidationHash(validationHash);
  };

  const addStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedEvent || !staffEmail.trim()) return;
    setSavingStaff(true);
    setError("");
    setNotice("");
    try {
      await ApiClient.instance.post("/dashboard/ticket-validation/events/{id}/staff", {
        params: { path: { id: selectedEvent.id } },
        body: { email: staffEmail.trim() },
      });
      setStaffEmail("");
      setNotice("Validatorul are acum acces la acest eveniment.");
      await loadStaff(selectedEvent.id);
    } catch {
      setError("Contul nu a putut fi adaugat. Verifica emailul si activarea contului Pulse.");
    } finally {
      setSavingStaff(false);
    }
  };

  const removeStaff = async (member: ValidationStaff) => {
    if (!selectedEvent) return;
    setError("");
    setNotice("");
    try {
      await ApiClient.instance.delete("/dashboard/ticket-validation/events/{id}/staff/{userId}", {
        params: { path: { id: selectedEvent.id, userId: member.id } },
      });
      setStaff((current) => current.filter((item) => item.id !== member.id));
      setNotice("Accesul validatorului a fost retras.");
    } catch {
      setError("Accesul validatorului nu a putut fi retras.");
    }
  };

  const createScannerAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedEvent || !scannerLabel.trim() || !scannerStartsAt || !scannerEndsAt) return;
    setCreatingScannerAccess(true);
    setError("");
    setNotice("");
    try {
      const response = await ApiClient.instance.post(
        "/dashboard/ticket-validation/events/{id}/quick-access",
        {
          params: { path: { id: selectedEvent.id } },
          body: {
            label: scannerLabel.trim(),
            startsAt: new Date(scannerStartsAt).toISOString(),
            endsAt: new Date(scannerEndsAt).toISOString(),
          },
        },
      );
      setLatestScannerAccess(response);
      setNotice("Linkul temporar a fost generat. Copiaza-l acum si trimite-l voluntarului.");
      await loadScannerAccesses(selectedEvent.id);
    } catch {
      setError("Linkul nu a putut fi generat. Intervalul trebuie sa fie in timpul evenimentului.");
    } finally {
      setCreatingScannerAccess(false);
    }
  };

  const copyScannerAccess = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Linkul de acces rapid a fost copiat.");
    } catch {
      setError("Linkul nu a putut fi copiat automat.");
    }
  };

  const revokeScannerAccess = async (access: ScannerAccess) => {
    if (!selectedEvent) return;
    setError("");
    setNotice("");
    try {
      await ApiClient.instance.delete(
        "/dashboard/ticket-validation/events/{id}/quick-access/{accessId}",
        { params: { path: { id: selectedEvent.id, accessId: access.id } } },
      );
      setScannerAccesses((current) => current.map((item) => item.id === access.id ? { ...item, revokedAt: new Date().toISOString() } : item));
      setNotice("Linkul de acces rapid a fost revocat.");
    } catch {
      setError("Linkul de acces rapid nu a putut fi revocat.");
    }
  };

  const companyReady = profile?.verificationStatus === "approved";

  return (
    <main className="min-h-screen pb-20 text-foreground">
      <div className="mx-auto max-w-5xl space-y-6 px-4 pt-7 sm:px-6 sm:pt-9">
        <header className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Acces eveniment</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Validare bilete</h1>
          <p className="text-sm text-muted-foreground">Verifica intrarea si gestioneaza conturile care pot valida pentru fiecare eveniment.</p>
        </header>

        <section className="rounded-xl border border-primary/25 bg-primary/[0.04] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Configurezi evenimentul</p>
          <div className="relative mt-3">
            <button type="button" onClick={() => setEventMenuOpen((open) => !open)} disabled={eventsLoading} className="flex h-11 w-full items-center justify-between rounded-lg border border-white/15 bg-background/60 px-3 text-left text-sm transition hover:bg-white/[0.08] disabled:opacity-50">
              <span className={selectedEvent ? "truncate" : "text-muted-foreground"}>{selectedEvent?.title || (eventsLoading ? "Se incarca evenimentele..." : "Alege evenimentul")}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition ${eventMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {eventMenuOpen && (
              <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-lg border border-white/15 bg-background p-1 shadow-xl">
                {events.map((event) => (
                  <button key={event.id} type="button" onClick={() => { setSelectedEventId(event.id); setEventMenuOpen(false); setResult(undefined); }} className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition hover:bg-white/5 ${event.id === selectedEventId ? "bg-primary/10 text-primary" : ""}`}>
                    <Ticket className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{event.title}</span>
                    {event.canManage && <span className="text-[10px] font-semibold uppercase text-muted-foreground">Organizator</span>}
                  </button>
                ))}
                {!events.length && !eventsLoading && <p className="px-3 py-3 text-sm text-muted-foreground">Nu ai evenimente atribuite pentru validare.</p>}
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Validatorii, linkurile temporare si scanarea de mai jos sunt limitate strict la evenimentul selectat.</p>
        </section>

        {isOrganizer && (profileLoading ? (
          <div className="h-28 animate-pulse rounded-xl border border-white/10 bg-white/5" />
        ) : !companyReady ? (
          <section className="rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-300" />
              <div>
                <h2 className="text-base font-semibold">Verificare firma</h2>
                <p className="mt-1 text-sm text-muted-foreground">Firma trebuie aprobata inainte sa publici evenimente sau sa vinzi bilete.</p>
              </div>
            </div>
            {profile?.verificationStatus === "pending" ? (
              <p className="mt-5 text-sm text-amber-200">Cererea este in curs de verificare.</p>
            ) : (
              <form onSubmit={submitCompany} className="mt-5 space-y-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                <input value={cui} onChange={(event) => setCui(event.target.value)} placeholder="CUI / CIF" required className="h-11 rounded-lg border border-white/15 bg-black/20 px-3 text-sm outline-none focus:border-primary/60" />
                <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Denumire firma" required className="h-11 rounded-lg border border-white/15 bg-black/20 px-3 text-sm outline-none focus:border-primary/60" />
                <button type="submit" disabled={submittingProfile || !agreementAccepted} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {submittingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                  Verifica
                </button>
                </div>
                <label className="flex cursor-pointer items-start gap-3 border border-white/10 bg-black/10 p-3 text-xs leading-5 text-muted-foreground">
                  <input type="checkbox" checked={agreementAccepted} onChange={(event) => setAgreementAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]" />
                  <span>Am citit si accept <a href="/organizers/agreement" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">Acordul pentru organizatori</a>, inclusiv regulile Stripe Connect, comisionul platformei si responsabilitatile fiscale.</span>
                </label>
              </form>
            )}
          </section>
        ) : (
          <section className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-5">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <div><p className="text-sm font-semibold">{profile.companyName}</p><p className="text-xs text-muted-foreground">CUI {profile.cui} - profil verificat</p></div>
          </section>
        ))}

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <ScanLine className="mt-0.5 h-5 w-5 text-primary" />
            <div><h2 className="text-base font-semibold">Verifica un bilet</h2><p className="mt-1 text-sm text-muted-foreground">Alege evenimentul si introdu sau lipeste codul securizat din QR.</p></div>
          </div>

          <form onSubmit={validateTicket} className="mt-5 space-y-3">
            <textarea value={validationHash} onChange={(event) => setValidationHash(event.target.value)} rows={3} placeholder="Lipeste sau introdu codul QR" className="w-full resize-none rounded-lg border border-white/15 bg-white/5 p-3 font-mono text-xs outline-none transition placeholder:font-sans placeholder:text-sm focus:border-primary/60" />
            <QrCameraScanner disabled={!selectedEventId || validating} onScan={(value) => void submitValidationHash(value)} />
            <button type="submit" disabled={!selectedEventId || !validationHash.trim() || validating} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50 sm:w-auto">
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              {validating ? "Se verifica..." : "Valideaza biletul"}
            </button>
          </form>

          {result && (
            <div className={`mt-5 flex gap-3 rounded-lg border p-4 ${result.status === "valid" ? "border-primary/30 bg-primary/10" : "border-amber-400/30 bg-amber-400/10"}`}>
              {result.status === "valid" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" /> : <XCircle className="mt-0.5 h-5 w-5 text-amber-300" />}
              <div><p className="text-sm font-semibold">{result.status === "valid" ? "Bilet valid" : "Bilet deja folosit"}</p><p className="mt-1 text-xs text-muted-foreground">{result.ticketType} - {result.eventTitle}</p></div>
            </div>
          )}
        </section>

        {selectedEvent?.canManage && (
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <UsersRound className="mt-0.5 h-5 w-5 text-primary" />
              <div><h2 className="text-base font-semibold">Echipa de validare</h2><p className="mt-1 text-sm text-muted-foreground">Conturile adaugate pot valida doar biletele pentru {selectedEvent.title}.</p></div>
            </div>

            <form onSubmit={addStaff} className="mt-5 flex flex-col gap-2 sm:flex-row">
              <input type="email" value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} placeholder="email@exemplu.ro" required className="h-11 min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 text-sm outline-none focus:border-primary/60" />
              <button type="submit" disabled={!staffEmail.trim() || savingStaff} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50">
                {savingStaff ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}
                Adauga acces
              </button>
            </form>

            <div className="mt-4 divide-y divide-white/10 rounded-lg border border-white/10">
              {staffLoading ? (
                <div className="flex h-16 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : staff.length ? staff.map((member) => (
                <div key={member.id} className="flex items-center gap-3 px-3 py-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><UserRoundCheck className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member.username}</p><p className="truncate text-xs text-muted-foreground">{member.email}</p></div>
                  <button type="button" onClick={() => void removeStaff(member)} aria-label={`Retrage accesul pentru ${member.username}`} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-muted-foreground transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                </div>
              )) : (
                <p className="px-3 py-4 text-sm text-muted-foreground">Doar contul tau poate valida momentan.</p>
              )}
            </div>
          </section>
        )}

        {selectedEvent?.canManage && (
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Link2 className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold">Link de acces rapid</h2>
                <p className="mt-1 text-sm text-muted-foreground">Pentru voluntari fara cont Pulse. Linkul ofera doar scanarea biletelor pentru {selectedEvent.title}.</p>
              </div>
            </div>

            <form onSubmit={createScannerAccess} className="mt-5 grid gap-3 md:grid-cols-2">
              <input value={scannerLabel} onChange={(event) => setScannerLabel(event.target.value)} maxLength={80} placeholder="Gate 1 Scanner" required className="h-11 rounded-lg border border-white/15 bg-white/5 px-3 text-sm outline-none focus:border-primary/60" />
              <div className="hidden md:block" />
              <label className="space-y-1.5 text-xs font-semibold text-muted-foreground"><span>Activ de la</span><input type="datetime-local" value={scannerStartsAt} onChange={(event) => setScannerStartsAt(event.target.value)} required className="h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-foreground outline-none focus:border-primary/60" /></label>
              <label className="space-y-1.5 text-xs font-semibold text-muted-foreground"><span>Pana la</span><input type="datetime-local" value={scannerEndsAt} onChange={(event) => setScannerEndsAt(event.target.value)} required className="h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-foreground outline-none focus:border-primary/60" /></label>
              <button type="submit" disabled={!scannerLabel.trim() || !scannerStartsAt || !scannerEndsAt || creatingScannerAccess} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50 md:col-span-2 md:w-fit">
                {creatingScannerAccess ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Genereaza link
              </button>
            </form>

            {latestScannerAccess && (
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/[0.07] p-3">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{latestScannerAccess.label}</p><button type="button" onClick={() => void copyScannerAccess(latestScannerAccess.url)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"><Copy className="h-3.5 w-3.5" />Copiaza</button></div>
                <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{latestScannerAccess.url}</p>
              </div>
            )}

            <div className="mt-4 divide-y divide-white/10 rounded-lg border border-white/10">
              {scannerAccessLoading ? (
                <div className="flex h-16 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : scannerAccesses.length ? scannerAccesses.map((access) => (
                <div key={access.id} className="flex items-center gap-3 px-3 py-3">
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${access.revokedAt ? "bg-white/5 text-muted-foreground" : "bg-primary/10 text-primary"}`}><Link2 className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{access.label}</p><p className="truncate text-xs text-muted-foreground">{formatDateTime(access.startsAt)} - {formatDateTime(access.endsAt)}</p></div>
                  {access.revokedAt ? <span className="text-xs font-semibold text-muted-foreground">Revocat</span> : <button type="button" onClick={() => void revokeScannerAccess(access)} aria-label={`Revoca linkul ${access.label}`} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-muted-foreground transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>}
                </div>
              )) : (
                <p className="px-3 py-4 text-sm text-muted-foreground">Nu exista linkuri temporare pentru acest eveniment.</p>
              )}
            </div>
          </section>
        )}

        {notice && <p className="text-sm text-primary">{notice}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </main>
  );
}
