"use client";

import Link from "next/link";
import {
  Check,
  KeyRound,
  Loader2,
  Mail,
  User as UserIcon,
  ArrowUpRight,
} from "lucide-react";
import { useState } from "react";
import { useDataProvider } from "@/core/DataProviderContext";
import { UserData } from "@/core/DataProvider";

export default function ProfilePage() {
  const { user } = useDataProvider();

  // Simulare stare verificare firma
  const [isVerified] = useState(false);

  return (
    <div className="w-full text-foreground pb-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-8 space-y-6">
        {/* HEADER SECTION */}
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Organizer
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Profil
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Actualizează datele publice și securitatea contului tău.
          </p>
        </div>

        {/* CONTAINER UNITAR - TOATE CARDURILE AU EXACT 24px (space-y-6 / gap-6) ÎNTRE ELE */}
        <div className="space-y-6">
          {/* 1. IDENTITY SUMMARY CARD */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
              <span className="text-xl font-bold">
                {user?.properties?.username?.slice(0, 2).toUpperCase() || "US"}
              </span>
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-base font-semibold">
                {user?.properties?.username || "Utilizator"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.properties?.email || "email@exemplu.com"}
              </p>

              <div className="pt-1">
                {isVerified ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                    Firmă verificată
                  </span>
                ) : (
                  <Link
                    href="/dashboard/ticket-validation"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 transition hover:text-amber-200"
                  >
                    <span>Neverificat — verifică firma</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* 2. GRID CU DETALII PUBLICE & EMAIL */}
          <div className="grid gap-6 md:grid-cols-2">
            <Section title="Detalii publice" icon={UserIcon}>
              <EditProfileForm userData={user?.properties as UserData} />
            </Section>

            <Section title="Email" icon={Mail}>
              <ChangeEmailForm userData={user?.properties as UserData} />
            </Section>
          </div>

          {/* 3. PAROLĂ & SECURITATE (FULL WIDTH) */}
          <Section title="Parolă & Securitate" icon={KeyRound}>
            <ResetPasswordForm userEmail={user?.properties?.email} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof UserIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full rounded-3xl border border-white/10 bg-white/5 p-6 space-y-5">
      <div className="flex items-center gap-2.5 pb-2 border-b border-white/5">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pl-0.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-white/[0.08]"
      />
    </div>
  );
}

function EditProfileForm({ userData }: { userData: UserData }) {
  const [name, setName] = useState(userData?.username ?? "");
  const [bio, setBio] = useState(userData?.bio ?? "");
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  return (
    <div className="space-y-4">
      <TextField label="Nume afișat" value={name} onChange={setName} />

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pl-0.5">
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          placeholder="Câteva cuvinte despre tine..."
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3.5 text-sm outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-white/[0.08]"
        />
      </div>

      <div className="pt-1">
        <button
          type="button"
          onClick={save}
          className="inline-flex h-10 w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-6 text-xs font-bold text-primary-foreground transition hover:opacity-90 active:scale-[0.98]"
        >
          {saved ? <Check className="h-4 w-4" /> : null}
          {saved ? "Salvat" : "Salvează Modificările"}
        </button>
      </div>
    </div>
  );
}

function ChangeEmailForm({ userData }: { userData: UserData }) {
  const [email, setEmail] = useState(userData?.email ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Introdu un email valid.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  return (
    <div className="space-y-4">
      <TextField
        label="Email"
        value={email}
        onChange={setEmail}
        type="email"
        placeholder="nume@exemplu.com"
      />

      {error && <p className="text-xs text-red-400 pl-0.5">{error}</p>}

      <p className="text-xs text-muted-foreground leading-relaxed">
        Vei primi un link de confirmare pe noua adresă pentru activare.
      </p>

      <div className="pt-1">
        <button
          type="button"
          onClick={save}
          className="inline-flex h-10 w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-6 text-xs font-bold text-primary-foreground transition hover:opacity-90 active:scale-[0.98]"
        >
          {saved ? <Check className="h-4 w-4" /> : null}
          {saved ? "Email Trimis" : "Trimite Confirmarea"}
        </button>
      </div>
    </div>
  );
}

function ResetPasswordForm({ userEmail }: { userEmail?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "sent">("idle");

  const send = async () => {
    setState("loading");
    setTimeout(() => {
      setState("sent");
      setTimeout(() => setState("idle"), 1500);
    }, 1000);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
        Îți vom trimite un link securizat de resetare a parolei direct pe adresa{" "}
        <strong className="text-foreground">
          {userEmail || "ta de email"}
        </strong>
        .
      </p>

      <button
        type="button"
        onClick={send}
        disabled={state !== "idle"}
        className="inline-flex h-10 w-full sm:w-auto shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-xs font-bold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
      >
        {state === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
        {state === "sent" && <Check className="h-4 w-4" />}
        {state === "idle" && "Resetează Parola"}
        {state === "loading" && "Se trimite..."}
        {state === "sent" && "Link Trimis"}
      </button>
    </div>
  );
}
