import { LegalDocument } from "@/features/legal/LegalDocument";

export default function TermsPage() {
  return <LegalDocument
    eyebrow="Document legal"
    title="Termeni si conditii"
    updatedAt="27 iulie 2026"
    intro="Acesti termeni guverneaza utilizarea platformei Pulse pentru descoperirea, publicarea si achizitia de bilete la evenimente."
    sections={[
      { title: "1. Rolul platformei", paragraphs: ["Pulse pune la dispozitie infrastructura tehnica pentru organizatori si participanti. Organizatorul afisat pe pagina evenimentului raspunde pentru organizarea, continutul, accesul si executarea evenimentului.", "Contractul privind participarea la eveniment se incheie intre cumparator si organizator, in conditiile comunicate de acesta. Pulse faciliteaza comanda si plata prin Stripe Connect."] },
      { title: "2. Conturi si acces", items: ["Pastrezi confidentiale datele de acces si raspunzi pentru actiunile realizate din contul tau.", "Nu poti utiliza platforma pentru activitati ilegale, frauduloase sau care incalca drepturile altor persoane.", "Putem suspenda accesul daca exista indicii rezonabile de frauda, abuz sau risc pentru participanti ori platforma."] },
      { title: "3. Bilete, plati si rambursari", paragraphs: ["Pretul, disponibilitatea si regulile de acces sunt stabilite de organizator. Plata este procesata de Stripe. Dupa confirmarea platii, biletul este disponibil in contul tau sau, pentru comenzi fara cont, la adresa de email folosita la comanda."], items: ["Rambursarile, amanarile si anularile sunt gestionate conform politicii evenimentului si obligatiilor organizatorului.", "Un bilet valid este personalizat printr-un cod securizat si poate fi folosit o singura data la validare.", "In cazul unei dispute de plata, putem coopera cu Stripe si organizatorul pentru verificarea comenzii."] },
      { title: "4. Responsabilitati", paragraphs: ["Pulse nu garanteaza calitatea, siguranta sau desfasurarea unui eveniment. Organizatorul ramane responsabil pentru autorizatii, informarea participantilor si documentele fiscale aferente biletelor vandute." ] },
      { title: "5. Modificari si contact", paragraphs: ["Putem actualiza acesti termeni cand serviciul sau cadrul legal se schimba. Pentru intrebari privind platforma, foloseste datele de contact publicate de operatorul Pulse." ] },
    ]}
  />;
}
