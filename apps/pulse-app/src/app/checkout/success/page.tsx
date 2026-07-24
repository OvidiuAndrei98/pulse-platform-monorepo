"use client";

import Link from "next/link";
import { CheckCircle2, Mail, Ticket, UserRoundPlus } from "lucide-react";
import { useDataProvider } from "@/core/DataProviderContext";

export default function CheckoutSuccessPage() {
  const { user, loading } = useDataProvider();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 pb-28">
        <div className="w-full max-w-md space-y-5 border border-white/10 bg-white/[0.03] p-6">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-white/10" />
          <div className="mx-auto h-5 w-2/3 animate-pulse bg-white/10" />
          <div className="mx-auto h-3 w-full animate-pulse bg-white/[0.06]" />
        </div>
      </main>
    );
  }

  const hasAccount = Boolean(user);

  return (
    <main className="flex min-h-screen items-center justify-center px-5 pb-28 pt-10">
      <section className="w-full max-w-xl border border-primary/25 bg-background/80 p-6 text-center sm:p-8">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-primary/35 bg-primary/15 text-primary">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-primary">Multumim</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Plata ta este in curs de confirmare.</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
          Vei primi confirmarea imediat ce plata este procesata de Stripe.
        </p>

        {hasAccount ? (
          <div className="mt-7 border border-white/10 bg-white/[0.03] p-5 text-left">
            <div className="flex gap-3"><Ticket className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">Biletele vor aparea in contul tau.</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">Le gasesti in Profil, impreuna cu codurile QR pentru acces.</p></div></div>
            <Link href="/users/me" className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"><Ticket className="h-4 w-4" /> Vezi biletele</Link>
          </div>
        ) : (
          <div className="mt-7 border border-white/10 bg-white/[0.03] p-5 text-left">
            <div className="flex gap-3"><Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">Biletele au fost trimise pe email.</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">Pastreaza emailul primit. Poti crea un cont Pulse cu aceeasi adresa pentru a vedea biletele si in aplicatie.</p></div></div>
            <Link href="/register" className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"><UserRoundPlus className="h-4 w-4" /> Creeaza cont</Link>
          </div>
        )}

        <Link href="/events" className="mt-6 inline-block text-sm font-semibold text-primary transition hover:opacity-80">Inapoi la evenimente</Link>
      </section>
    </main>
  );
}
