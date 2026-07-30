import { Suspense } from "react";
import { AgreementAcceptance } from "@/components/organizer/AgreementAcceptance";
import { LegalDocument } from "@/features/legal/LegalDocument";

export default function OrganizerAgreementPage() {
  if (process.env.CAPACITOR_BUILD === "true") {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-5 pb-32 pt-12 text-foreground sm:px-7 sm:pt-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Glow</p>
        <h1 className="mt-3 text-3xl font-semibold">Organizer agreement</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
          Complete your organizer agreement from the web dashboard before creating paid events.
        </p>
      </main>
    );
  }

  return <LegalDocument
      eyebrow="Pentru organizatori"
      title="Acord pentru organizatori"
      updatedAt="27 iulie 2026, versiunea 2026-07-27-glow"
      intro="Acest acord stabileste relatia dintre Glow si organizatorii care publica evenimente sau vand bilete prin platforma."
      sections={[
        { title: "1. Calitatea partilor", paragraphs: ["Organizatorul declara ca are dreptul sa reprezinte firma indicata in profil si sa publice evenimente in numele acesteia. Glow furnizeaza infrastructura tehnica pentru listare, comenzi, plati si validare."] },
        { title: "2. Responsabilitatea pentru eveniment", items: ["Organizatorul raspunde pentru informatiile publicate, autorizatii, siguranta, acces, desfasurarea, anularea sau reprogramarea evenimentului.", "Organizatorul este responsabil pentru relatia comerciala si informarea participantilor, inclusiv politica proprie de rambursare.", "Organizatorul emite documentele fiscale aferente accesului la eveniment si isi indeplineste obligatiile fiscale proprii."] },
        { title: "3. Plati prin Stripe Connect", paragraphs: ["Pentru a vinde bilete, organizatorul deschide si completeaza un cont Stripe Connect Express pe fluxul gazduit de Stripe. Stripe verifica identitatea, datele firmei si contul bancar si decide daca platile si transferurile pot fi activate.", "Glow foloseste in prezent un flux Stripe Connect cu destination charges: plata este procesata pe contul platformei, iar fondurile aferente evenimentului sunt directionate catre contul conectat al organizatorului, conform configuratiei Stripe."] },
        { title: "4. Comision si decontare", paragraphs: ["Pentru fiecare bilet cu plata finalizata, Glow retine un comision de 4% din valoarea biletului plus 2,50 RON pentru fiecare bilet vandut. Comisionul este vizibil in situatia financiara din dashboard si va fi facturat organizatorului conform fluxului de facturare stabilit de Glow.", "Taxele Stripe, refundurile, chargeback-urile si corectiile pot afecta soldurile. Organizatorul autorizeaza Glow sa compenseze sumele datorate prin transferuri viitoare sau alte mecanisme permise de Stripe si lege."] },
        { title: "5. Date personale", paragraphs: ["Glow si organizatorul prelucreaza datele participantilor numai pentru scopurile necesare evenimentului, biletelor, accesului si obligatiilor legale. Fiecare parte isi indeplineste propriile obligatii de confidentialitate si protectie a datelor."] },
        { title: "6. Suspendare si incetare", paragraphs: ["Glow poate suspenda publicarea, vanzarea sau transferurile atunci cand exista risc de frauda, plangeri relevante, incalcarea acordului, cerinte Stripe sau obligatii legale. Incetarea acordului nu afecteaza comenzile, disputele si obligatiile deja aparute."] },
      ]}
    >
      <Suspense fallback={<div className="mt-8 h-24 animate-pulse border border-white/10 bg-white/[0.03]" />}>
        <AgreementAcceptance />
      </Suspense>
    </LegalDocument>;
}
