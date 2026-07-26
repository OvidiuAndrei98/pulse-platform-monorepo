import Link from "next/link";
import { ArrowRight, Building2, CreditCard, ShieldCheck, WalletCards } from "lucide-react";

const steps = [
  { icon: Building2, title: "1. Firma verificata", text: "Trimiti CUI-ul si denumirea firmei. Poti crea evenimente dupa aprobarea profilului." },
  { icon: CreditCard, title: "2. Cont Stripe Connect", text: "Completezi formularul oficial Stripe cu datele reprezentantului, ale firmei si contului bancar." },
  { icon: WalletCards, title: "3. Vanzari si transferuri", text: "Dupa activare, poti adauga bilete. Stripe proceseaza plata, iar soldul aferent organizatorului urmeaza programul de transfer al contului Connect." },
];

export default function StripeConnectPage() {
  return <main className="mx-auto min-h-screen max-w-3xl px-5 pb-32 pt-12 text-foreground sm:px-7 sm:pt-16">
    <Link href="/" className="text-xs font-semibold text-primary transition hover:opacity-80">Pulse</Link>
    <header className="mt-7 border-b border-white/10 pb-8"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Pentru organizatori</p><h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Cum functioneaza Stripe Connect</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Stripe Connect permite platformei sa proceseze plati pentru bilete si sa directioneze fondurile catre organizatorul verificat.</p></header>
    <section className="grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-3">{steps.map(({ icon: Icon, title, text }) => <article key={title} className="bg-[#101311] p-5"><span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><h2 className="mt-5 text-sm font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></article>)}</section>
    <section className="mt-8 border border-white/10 bg-white/[0.03] p-5 sm:p-6"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="text-base font-semibold">Ce ramane in responsabilitatea organizatorului</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Evenimentul, informarea participantilor, documentele fiscale, anularea sau rambursarea si raspunsul la dovezi pentru dispute. Pentru fluxul actual cu destination charges, platforma trebuie sa gestioneze operational costurile Stripe, refundurile si chargeback-urile, apoi le poate reconcilia cu organizatorul conform acordului.</p></div></div></section>
    <section className="mt-8 border border-primary/25 bg-primary/[0.04] p-5"><h2 className="text-base font-semibold">Inainte de activare</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Citeste si accepta Acordul pentru organizatori. Acesta explica exact comisionul Pulse de 5% + 1 RON pe bilet si regulile de decontare.</p><Link href="/organizers/agreement" className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Vezi acordul <ArrowRight className="h-4 w-4" /></Link></section>
  </main>;
}
