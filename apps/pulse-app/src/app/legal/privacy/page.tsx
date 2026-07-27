import { LegalDocument } from "@/features/legal/LegalDocument";

export default function PrivacyPage() {
  return <LegalDocument
    eyebrow="Date personale"
    title="Politica de confidentialitate"
    updatedAt="27 iulie 2026"
    intro="Aceasta politica explica ce date foloseste Glow pentru conturi, evenimente, bilete, plati si siguranta serviciului."
    sections={[
      { title: "1. Date prelucrate", items: ["Date de cont: username, email, parola stocata securizat, fotografie si bio daca alegi sa le completezi.", "Date pentru bilete: eveniment, tip bilet, cod securizat, adresa de email si istoricul validarii.", "Date de organizator: denumire, CUI, adresa fiscala, starea verificarii si identificatorul contului Stripe Connect.", "Date tehnice si de securitate: adresa IP pentru acceptarea acordului de organizator, tokenuri de sesiune si jurnale necesare prevenirii abuzului."] },
      { title: "2. Scopuri si temei", paragraphs: ["Folosim datele pentru furnizarea contului, emiterea si validarea biletelor, procesarea comenzilor, suport, prevenirea fraudei si respectarea obligatiilor legale. Prelucrarea se bazeaza, dupa caz, pe executarea contractului, obligatie legala, interes legitim sau consimtamant." ] },
      { title: "3. Partajarea datelor", paragraphs: ["Partajam date strict necesare cu organizatorul evenimentului, Stripe pentru plati si verificarea contului Connect, furnizori de email si infrastructura cloud. Nu vindem date personale." ] },
      { title: "4. Perioada de pastrare", paragraphs: ["Pastram datele cat timp este necesar pentru cont, bilete, solutionarea disputelor si obligatiile contabile sau legale. Dovezile acceptarii acordului de organizator sunt pastrate pentru apararea drepturilor si trasabilitate." ] },
      { title: "5. Drepturile tale", items: ["Poti cere acces, rectificare, stergere, restrictionare, opozitie sau portabilitate in limitele aplicabile.", "Poti depune o plangere la autoritatea competenta pentru protectia datelor.", "Pentru o solicitare, contacteaza operatorul platformei folosind canalul de suport publicat in aplicatie."] },
    ]}
  />;
}
