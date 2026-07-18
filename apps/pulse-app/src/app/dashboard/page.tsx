"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDataProvider } from "@/core/DataProviderContext";

// Mapare pe modelul tău din TypeSpec
interface OrganizerProfile {
  id: string;
  userId: string;
  companyName: string;
  cui: string;
  isVerified: boolean;
  verificationStatus: "pending" | "approved" | "rejected";
  caenCode?: string;
  createdAt: string;
}

export default function OrganizerDashboard() {
  const { user, logout } = useDataProvider();

  // State-uri pentru gestionarea profilului ANAF
  const [profile, setProfile] = useState<OrganizerProfile | undefined>(
    undefined,
  );
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [cui, setCui] = useState("");
  const [companyName, setCompanyName] = useState("");

  // 1. Încarcă starea profilului la inițializarea paginii
  useEffect(() => {
    async function fetchProfile() {
      try {
        setIsLoadingProfile(true);
        const data = await user?.getOrganizerProfile();
        setProfile(data);
      } catch (err) {
        console.error("Eroare la obținerea profilului organizatorului:", err);
      } finally {
        setIsLoadingProfile(false);
      }
    }

    if (user) {
      fetchProfile();
    }
  }, [user]);

  // 2. Trimite datele către backend (care va executa anaf.Lookup și salvarea în DB)
  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cui || !companyName) return;

    try {
      setIsSubmitting(true);
      setError(null);

      // POST /organizer/profile conform TypeSpec
      const updatedProfile = await user?.updateOrganizerProfile(
        cui,
        companyName,
      );

      setProfile(updatedProfile);
    } catch (err: any) {
      setError(
        err?.message || "Eroare la verificarea CUI-ului prin serviciul ANAF.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-1">
              Organizator
            </p>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Bună, {user?.properties.username} 👋
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/me"
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              Profilul meu
            </Link>
            <button
              onClick={logout}
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              Deconectare
            </button>
          </div>
        </div>

        {/* Zona de Verificare ANAF / Status Profil */}
        <div className="mb-10">
          {isLoadingProfile ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 animate-pulse text-sm text-zinc-500">
              Se verifică starea înregistrării juridice...
            </div>
          ) : !profile ? (
            /* Formular completare CUI dacă profilul nu există */
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20 p-6">
              <h2 className="text-base font-semibold text-amber-900 dark:text-amber-400 mb-2">
                ⚠️ Verificare Legală Obligatorie (ANAF)
              </h2>
              <p className="text-sm text-amber-700 dark:text-amber-500 mb-6">
                Pentru a putea publica evenimente și a încasa bani pe platformă,
                trebuie să introduci datele firmei tale (PFA sau SRL). Acestea
                vor fi validate automat în registrul ANAF.
              </p>

              <form
                onSubmit={handleSubmitProfile}
                className="space-y-4 max-w-md"
              >
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase mb-1">
                    CUI / CIF Companie
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 12345678"
                    value={cui}
                    onChange={(e) => setCui(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase mb-1">
                    Nume Complet Companie (exact ca la RECOM)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: PARTY SRL"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
                  />
                </div>

                {error && (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-zinc-900 dark:bg-zinc-50 px-4 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSubmitting ? "Se validează la ANAF..." : "Verifică Firma"}
                </button>
              </form>
            </div>
          ) : (
            /* Afișare status dacă profilul există */
            <div
              className={`rounded-2xl border p-6 ${
                profile.verificationStatus === "approved"
                  ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/50 dark:bg-emerald-950/10"
                  : profile.verificationStatus === "pending"
                    ? "border-blue-200 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-950/10"
                    : "border-red-200 bg-red-50/30 dark:border-red-900/50 dark:bg-red-950/10"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
                    {profile.companyName}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    CUI: {profile.cui} • Status ANAF:{" "}
                    <span className="font-medium">Activ</span>
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    profile.verificationStatus === "approved"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : profile.verificationStatus === "pending"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                  }`}
                >
                  {profile.verificationStatus === "approved" &&
                    "✓ Profil Verificat"}
                  {profile.verificationStatus === "pending" &&
                    "⏳ În curs de verificare"}
                  {profile.verificationStatus === "rejected" && "✕ Respins"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Quick actions (Blocate condiționat dacă nu e verificat profilul) */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 ${!profile || profile.verificationStatus !== "approved" ? "opacity-40 pointer-events-none select-none" : ""}`}
        >
          <Link
            href="/organizer/dashboard/events/new"
            className="rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-6 flex flex-col gap-2 hover:border-zinc-500 dark:hover:border-zinc-500 hover:bg-white dark:hover:bg-zinc-900 transition-all"
          >
            <span className="text-3xl">＋</span>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              Eveniment nou
            </p>
            <p className="text-sm text-zinc-500">
              Creează și publică un eveniment pe platformă
            </p>
          </Link>

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 flex flex-col gap-2 opacity-50 cursor-not-allowed">
            <span className="text-3xl">📊</span>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              Statistici
            </p>
            <p className="text-sm text-zinc-500">Disponibil în curând</p>
          </div>
        </div>

        {/* Events list placeholder */}
        <div
          className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 ${!profile || profile.verificationStatus !== "approved" ? "opacity-40 pointer-events-none select-none" : ""}`}
        >
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
            Evenimentele mele
          </h2>
          <p className="text-sm text-zinc-500">
            Nu ai evenimente încă.{" "}
            <Link
              href="/organizer/dashboard/events/new"
              className="text-zinc-900 dark:text-zinc-50 font-medium underline underline-offset-4"
            >
              Creează primul tău eveniment
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
