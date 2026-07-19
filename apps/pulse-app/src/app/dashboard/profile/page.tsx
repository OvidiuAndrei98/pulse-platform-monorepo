"use client";

import Link from "next/link";
import { Check, KeyRound, Loader2, Mail, User } from "lucide-react";
import { useState } from "react";
import { useDataProvider } from "@/core/DataProviderContext";
import { UserData } from "@/core/DataProvider";

export default function ProfilePage() {
  const { user } = useDataProvider();
  return (
    <div className="min-h-screen bg-background pb-40 text-foreground">
      <div className="mx-auto max-w-3xl px-5 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Organizer
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          Profil
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Actualizează datele publice și securitatea contului tău.
        </p>

        {/* Identity summary */}
        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <span className="text-lg font-semibold">
              {user?.properties.username.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {user?.properties.username}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.properties.email}
            </p>
            {false ? (
              <p className="mt-1 text-[11px] font-semibold text-primary">
                Firmă verificată
              </p>
            ) : (
              <Link
                href="/organizer/verify"
                className="mt-1 inline-block text-[11px] font-semibold text-amber-300 underline-offset-2 hover:underline"
              >
                Neverificat — verifică firma
              </Link>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Section title="Detalii publice" icon={User}>
            <EditProfileForm userData={user?.properties as UserData} />
          </Section>
          <Section title="Email" icon={Mail}>
            <ChangeEmailForm userData={user?.properties as UserData} />
          </Section>
          <Section title="Parolă" icon={KeyRound}>
            <ResetPasswordForm />
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
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
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
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
      />
    </div>
  );
}

function EditProfileForm({ userData }: { userData: UserData }) {
  //   const { profile } = useOrganizerStore();
  const [name, setName] = useState(userData?.username ?? "");
  const [bio, setBio] = useState(userData?.bio ?? "");
  const [saved, setSaved] = useState(false);

  const save = () => {
    // updateProfile({ name: name.trim() || profile.name, bio: bio.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  return (
    <div className="space-y-3">
      <TextField label="Nume afișat" value={name} onChange={setName} />
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          placeholder="Câteva cuvinte despre tine..."
          className="mt-1.5 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
        />
      </div>
      <button
        onClick={save}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
      >
        {saved ? <Check className="h-4 w-4" /> : null}
        {saved ? "Salvat" : "Salvează"}
      </button>
    </div>
  );
}

function ChangeEmailForm({ userData }: { userData: UserData }) {
  //   const { profile } = useOrganizerStore();
  const [email, setEmail] = useState(userData?.email ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Introdu un email valid.");
      return;
    }
    // updateProfile({ email: email.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  return (
    <div className="space-y-3">
      <TextField
        label="Email"
        value={email}
        onChange={setEmail}
        type="email"
        placeholder="nume@exemplu.com"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-[11px] text-muted-foreground">
        Vei primi un link de confirmare pe adresa nouă.
      </p>
      <button
        onClick={save}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
      >
        {saved ? <Check className="h-4 w-4" /> : null}
        {saved ? "Trimis" : "Trimite confirmarea"}
      </button>
    </div>
  );
}

function ResetPasswordForm() {
  //   const { profile } = useOrganizerStore();
  const [state, setState] = useState<"idle" | "loading" | "sent">("idle");

  const send = async () => {
    setState("loading");
    // await requestPasswordReset();
    setState("sent");
    setTimeout(() => setState("idle"), 1500);
  };

  return (
    <div>
      <p className="text-xs text-muted-foreground">
        Trimitem un link de resetare pe{" "}
        {/* <span className="font-semibold text-foreground">{user?.properties.email}</span>. */}
      </p>
      <button
        onClick={send}
        disabled={state !== "idle"}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-70"
      >
        {state === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
        {state === "sent" && <Check className="h-4 w-4" />}
        {state === "idle" && "Trimite linkul"}
        {state === "loading" && "Se trimite..."}
        {state === "sent" && "Link trimis"}
      </button>
    </div>
  );
}
