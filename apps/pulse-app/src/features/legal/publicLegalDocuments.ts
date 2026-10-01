import type { LegalSection } from "@/features/legal/LegalDocument";

export type PublicLegalDocument = {
  eyebrow: string;
  title: string;
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
};

const companyRo = "CODELAB DEV S.R.L., CUI 51624866, nr. de ordine în Registrul Comerțului J2025026760004, cu sediul în Intrarea Năruja nr. 5, Sector 4, București, România";
const companyEn = "CODELAB DEV S.R.L., Romanian tax identification number 51624866, Trade Register number J2025026760004, registered office at 5 Intrarea Năruja, District 4, Bucharest, Romania";

const roTerms: PublicLegalDocument = {
  eyebrow: "Document legal",
  title: "Termeni și condiții",
  updatedAt: "1 octombrie 2026",
  intro: "Acești termeni reglementează accesul la SPOTTR, utilizarea funcțiilor sociale și achiziția sau rezervarea biletelor publicate în platformă.",
  sections: [
    {
      title: "1. Operatorul SPOTTR și rolurile comerciale",
      paragraphs: [
        `${companyRo} operează platforma SPOTTR, disponibilă la spottr.ro. Ne poți contacta la contact@code-lab.ro.`,
        "SPOTTR oferă infrastructura tehnică pentru publicarea evenimentelor, comenzi, plăți, emiterea și validarea biletelor. Organizatorul indicat pe pagina evenimentului stabilește oferta, este responsabil pentru desfășurarea evenimentului și este comerciantul care vinde sau acordă accesul. Pentru serviciile de promovare cumpărate de organizatori, furnizorul este CODELAB DEV S.R.L.",
      ],
      links: [{ label: "Contact SPOTTR", href: "mailto:contact@code-lab.ro" }],
    },
    {
      title: "2. Acceptarea termenilor și contul",
      items: [
        "Prin crearea unui cont, rezervarea unui bilet gratuit sau trimiterea unei comenzi confirmi că ai citit acești termeni și că informațiile furnizate sunt corecte.",
        "Trebuie să ai capacitatea legală de a încheia contractul. Dacă ești minor, folosești serviciul numai cu acordul și sub supravegherea reprezentantului legal și cu respectarea limitelor de vârstă stabilite de organizator.",
        "Răspunzi pentru păstrarea confidențialității datelor de acces și pentru activitatea realizată din contul tău. Anunță-ne fără întârziere dacă suspectezi acces neautorizat.",
      ],
    },
    {
      title: "3. Evenimente și modalități de acces",
      paragraphs: [
        "Organizatorul furnizează titlul, descrierea, data, locul, regulile de acces, tipurile de bilete, capacitatea, perioada de vânzare, prețul și regimul TVA al evenimentului. Organizatorul răspunde pentru exactitatea și actualizarea acestor informații.",
        "Un eveniment poate avea bilete cu plată, bilete gratuite rezervate în SPOTTR sau un link către o platformă externă. Pentru vânzarea externă, contractul, plata, livrarea și politica de rambursare sunt guvernate de condițiile furnizorului extern și ale organizatorului; SPOTTR nu procesează acea comandă.",
      ],
    },
    {
      title: "4. Comanda și disponibilitatea biletelor",
      items: [
        "Selectarea unui bilet nu garantează disponibilitatea. Pentru biletele cu plată, locurile sunt rezervate temporar cât timp sesiunea de plată este activă; o sesiune abandonată, neplătită sau expirată nu produce un bilet.",
        "Contractul pentru un bilet cu plată se confirmă după verificarea plății și emiterea comenzii. Pentru un bilet gratuit, confirmarea are loc la finalizarea rezervării în SPOTTR.",
        "Biletele epuizate, cele pentru care vânzarea nu a început sau cele a căror perioadă de vânzare s-a încheiat nu pot fi comandate.",
      ],
    },
    {
      title: "5. Preț, taxe, plată și factură",
      paragraphs: [
        "Înainte de plată sunt afișate valoarea biletelor, reducerea aplicabilă, taxa de ticketing și procesare și totalul. Taxa standard a platformei este de 4% din valoarea biletului după reducere plus 2,50 RON pentru fiecare bilet, dacă organizatorul nu alege să o suporte. Prețul biletului include TVA aplicabil potrivit cotei declarate de organizator.",
        "Plata este procesată în Stripe Checkout, ca plată în contul Stripe conectat al organizatorului. SPOTTR primește comisionul de platformă prin Stripe Connect și nu stochează numărul complet al cardului. Revenirea în aplicație după Stripe nu reprezintă singură confirmarea plății; comanda este confirmată numai după verificarea rezultatului.",
        "Factura pentru o comandă de bilete cu plată este emisă de organizator prin furnizorul de facturare configurat de acesta și este transmisă folosind datele introduse la checkout. Rezervările gratuite nu generează factură. Factura pentru promovarea unui eveniment este emisă de CODELAB DEV S.R.L. organizatorului care cumpără serviciul.",
      ],
    },
    {
      title: "6. Livrarea și folosirea biletelor",
      items: [
        "După confirmare, biletul este trimis la adresa de email folosită în comandă și, pentru cumpărăturile autentificate, apare și în cont.",
        "Fiecare bilet are un cod unic și un cod QR. Nu le publica și nu le trimite unei persoane în care nu ai încredere; primul cod valid scanat poate fi acceptat la intrare.",
        "Organizatorul poate verifica biletul la acces și poate aplica reguli legitime privind vârsta, identitatea, conduita, obiectele interzise sau ora de intrare, dacă acestea au fost comunicate și sunt conforme cu legea.",
      ],
    },
    {
      title: "7. Anulare, reprogramare și rambursări",
      paragraphs: [
        "Dacă anularea unui eveniment este aprobată în SPOTTR, platforma solicită rambursarea integrală a sumei achitate pentru fiecare comandă, inclusiv taxa de ticketing plătită de cumpărător. Termenul în care suma ajunge în cont depinde de Stripe, bancă și metoda de plată. Rambursările în așteptare, eșuate sau parțiale sunt reconciliate și pot necesita verificare manuală.",
        "Pentru o cerere voluntară de rambursare, reprogramare ori modificarea evenimentului se aplică politica organizatorului și drepturile obligatorii prevăzute de lege. Pentru servicii de agrement furnizate la o dată sau într-o perioadă determinată, dreptul de retragere de 14 zile poate fi exceptat conform art. 16 lit. l) din OUG nr. 34/2014. Excepția nu înlătură drepturile în cazul anulării, neexecutării sau unei prestații neconforme.",
      ],
    },
    {
      title: "8. Funcții sociale și grupul evenimentului",
      items: [
        "Poți salva evenimente, urmări organizatori, adăuga prieteni și indica interesul sau participarea. Vizibilitatea participării se gestionează din profil.",
        "Deținătorii de bilete pot crea grupuri private pentru un eveniment și pot trimite mesaje sau alerte de ajutor membrilor grupului. Funcția nu contactează organizatorul, 112, poliția, serviciile medicale sau alte servicii de urgență și nu trebuie folosită în locul acestora.",
        "Accesul la grup, mesaje și notificările sale de siguranță expiră la 24 de ore după ora de încheiere a evenimentului. Ștergerea din sistemele active este realizată automat de procesul periodic de curățare; eventualele copii reziduale urmează ciclul operațional configurat al copiilor de siguranță și nu mai sunt accesibile în aplicație.",
      ],
    },
    {
      title: "9. Conținut și conduită",
      items: [
        "Nu folosi SPOTTR pentru fraudă, hărțuire, acces neautorizat, revânzare înșelătoare, încălcarea drepturilor altora, distribuirea de programe malițioase sau publicarea de conținut ilegal.",
        "Organizatorii garantează că au dreptul să publice textele și imaginile încărcate și răspund pentru autorizații, siguranță, capacitate, personal și executarea evenimentului.",
        "Putem elimina conținut, limita funcții sau suspenda un cont când este necesar pentru securitate, prevenirea fraudei, respectarea legii ori protejarea utilizatorilor. Dacă situația permite, vom comunica motivul și pașii disponibili.",
      ],
    },
    {
      title: "10. Disponibilitatea serviciului și răspunderea",
      paragraphs: [
        "Depunem eforturi rezonabile pentru disponibilitatea platformei, dar pot exista mentenanță, întreruperi ale furnizorilor sau incidente tehnice. Vom încerca să păstrăm corecte comenzile confirmate și să reconciliem plățile al căror rezultat nu a fost primit imediat.",
        "CODELAB DEV S.R.L. răspunde pentru funcționarea serviciilor SPOTTR pe care le furnizează și nu exclude răspunderea care nu poate fi limitată prin lege. Organizatorul răspunde pentru eveniment, acces, informațiile sale, autorizații și executarea obligațiilor față de participant.",
      ],
    },
    {
      title: "11. Reclamații, lege aplicabilă și modificări",
      paragraphs: [
        "Pentru probleme privind o comandă sau funcționarea SPOTTR, scrie la contact@code-lab.ro și include adresa folosită la comandă și identificatorul comenzii, fără a trimite datele cardului. Pentru desfășurarea evenimentului poți contacta și organizatorul afișat pe pagina acestuia.",
        "Consumatorii pot sesiza Autoritatea Națională pentru Protecția Consumatorilor și pot folosi procedura de Soluționare Alternativă a Litigiilor. Acești termeni sunt guvernați de legea română; alegerea legii nu limitează normele obligatorii aplicabile consumatorului și dreptul său de a se adresa instanțelor competente.",
        "Putem actualiza termenii pentru schimbări legislative sau funcționale. Versiunea și data publicării sunt afișate în această pagină; modificările nu înlătură drepturile deja dobândite printr-o comandă confirmată.",
      ],
      links: [
        { label: "Trimite o solicitare", href: "mailto:contact@code-lab.ro" },
        { label: "Soluționare alternativă ANPC", href: "https://anpc.ro/sal/" },
      ],
    },
  ],
};

const roPrivacy: PublicLegalDocument = {
  eyebrow: "Date personale",
  title: "Politica de confidențialitate",
  updatedAt: "1 octombrie 2026",
  intro: "Această politică explică ce date prelucrează SPOTTR, de ce sunt necesare, cui le comunicăm și cum îți poți exercita drepturile.",
  sections: [
    {
      title: "1. Operatorul datelor și contact",
      paragraphs: [
        `${companyRo} este operatorul datelor prelucrate pentru administrarea contului SPOTTR, funcțiile sociale, securitatea platformei și operarea comenzilor și biletelor. Pentru întrebări sau cereri privind datele personale ne poți scrie la contact@code-lab.ro.`,
        "Organizatorul evenimentului este operator independent pentru organizarea și accesul la eveniment, relația cu participanții și obligațiile sale fiscale. Stripe prelucrează datele de plată și de verificare potrivit propriilor condiții și politici. Furnizorul de facturare ales de organizator prelucrează datele necesare emiterii documentelor fiscale.",
      ],
      links: [{ label: "Contact pentru date personale", href: "mailto:contact@code-lab.ro" }],
    },
    {
      title: "2. Datele pe care le prelucrăm",
      items: [
        "Cont și autentificare: nume de utilizator, email, hashul parolei, identificator Google dacă alegi autentificarea Google, limba, rolul, starea contului, sesiuni și tokenuri de activare sau resetare.",
        "Profil și comunitate: fotografie, descriere, prietenii și cereri de prietenie, organizatori urmăriți, evenimente salvate, răspunsuri de participare, preferințe și notificări.",
        "Comenzi și bilete: emailul cumpărătorului, evenimentul, tipurile și cantitatea biletelor, prețurile istorice ale comenzii, cod promoțional, starea plății, identificatorii Stripe, codul biletului, validarea, rambursările și disputele.",
        "Facturare: nume, adresă, localitate, județ sau sector, țară și, când este relevant, date fiscale. Dacă alegi salvarea lor, păstrăm separat un profil de facturare reutilizabil; nu păstrăm datele cardului.",
        "Organizatori: identitatea utilizatorului, denumirea și CUI-ul firmei, date de verificare, acceptarea acordului, starea contului Stripe Connect, setările de facturare, evenimentele, promovările, comisioanele și documentele aferente.",
        "Validare offline: pe dispozitivul unui validator autorizat pot fi descărcate identificatorul biletului, hashul de validare, tipul biletului și datele scanărilor, împreună cu un identificator aleatoriu al dispozitivului. Aceste date sunt folosite exclusiv pentru verificarea accesului și sincronizarea scanărilor când conexiunea revine.",
        "Date tehnice și de securitate: adresă IP sau reprezentări criptografice ale acesteia, identificatori de sesiune, tipul dispozitivului și browserului, data și ora cererilor, erori, jurnale de securitate și acțiuni administrative.",
      ],
    },
    {
      title: "3. Locație, hartă și conținut încărcat",
      paragraphs: [
        "Cu permisiunea dispozitivului, aplicația citește coordonatele curente pentru a centra harta și a calcula local, pe dispozitiv, distanța față de evenimente. Coordonatele curente nu sunt trimise API-ului SPOTTR. Furnizorul hărții poate deduce zona vizualizată din plăcile de hartă solicitate și primește date tehnice precum adresa IP.",
        "Harta folosește date OpenStreetMap și servicii CARTO. Organizatorii folosesc Google Maps Places pentru căutarea locației unui eveniment. Imaginile de profil, bannerele și actualizările foto sunt stocate în infrastructura media SPOTTR; conținutul publicat poate fi vizibil altor utilizatori.",
      ],
    },
    {
      title: "4. Scopuri și temeiuri juridice",
      items: [
        "Executarea contractului și demersuri la cererea ta: creare și administrare cont, autentificare, funcții sociale solicitate, comenzi, rezervări gratuite, livrare și validare bilete, grupuri private și suport.",
        "Obligații legale: evidențe fiscale și contabile, răspunsuri către autorități, gestionarea drepturilor consumatorilor și păstrarea documentelor impuse de lege.",
        "Interes legitim: securizarea serviciului, prevenirea fraudei și abuzului, limitarea cererilor automate, investigarea incidentelor, reconcilierea plăților, soluționarea disputelor și apărarea drepturilor în instanță. Evaluăm aceste interese în raport cu drepturile utilizatorilor.",
        "Consimțământ sau alegere explicită, unde este necesar: permisiunea de localizare a dispozitivului și eventuale comunicări comerciale opționale. Poți retrage permisiunea din setările dispozitivului; SPOTTR nu transmite în prezent newslettere de marketing fără acord separat.",
      ],
    },
    {
      title: "5. Vizibilitatea în SPOTTR",
      paragraphs: [
        "Numele de utilizator, fotografia și descrierea profilului pot fi publice. Adresa de email, datele de facturare, identificatorii de plată și codurile biletelor nu sunt afișate public.",
        "Setarea de vizibilitate a participării este activă implicit și poate fi dezactivată din Profil. Când este activă, alți utilizatori pot vedea că participi sau ești interesat de un eveniment; nu văd codul biletului sau datele de plată. Mesajele și alertele dintr-un grup al evenimentului sunt vizibile numai membrilor acelui grup.",
      ],
    },
    {
      title: "6. Cui comunicăm datele",
      items: [
        "SPOTTR nu vinde date personale.",
        "Organizatorului evenimentului, pentru executarea comenzii, acces, facturare, anulare, rambursare și gestionarea incidentelor legate de eveniment.",
        "Stripe și contului Stripe conectat al organizatorului, pentru checkout, procesarea plății, verificări, prevenirea fraudei, rambursări și dispute.",
        "Oblio sau SmartBill, în funcție de alegerea organizatorului, pentru emiterea, transmiterea și, unde este configurat, raportarea documentelor fiscale.",
        "Amazon Web Services pentru API, baze de date, stocare media, secrete și jurnale; Vercel pentru găzduirea aplicației web; Resend pentru emailuri tranzacționale.",
        "Google pentru autentificare și Google Maps Places, dacă folosești funcțiile respective; CARTO și OpenStreetMap pentru afișarea hărții.",
        "Autorităților, instanțelor, auditorilor sau consultanților când comunicarea este impusă de lege ori necesară pentru constatarea, exercitarea sau apărarea unui drept.",
      ],
    },
    {
      title: "7. Transferuri internaționale",
      paragraphs: [
        "Furnizorii tehnologici pot prelucra date în Spațiul Economic European și, în funcție de serviciu și suport, în alte jurisdicții. Orice transfer în afara SEE trebuie să îndeplinească cerințele capitolului V din RGPD; mecanismul aplicabil depinde de furnizor și destinație și poate include o decizie de adecvare sau clauze contractuale standard. Poți cere informații despre destinația și garanția aplicabilă prelucrării tale la contact@code-lab.ro.",
      ],
    },
    {
      title: "8. Stocare locală, cookie-uri și securitate",
      paragraphs: [
        "SPOTTR folosește stocare locală ori securizată pe dispozitiv pentru sesiunea de autentificare, cache și preferințe, precum și cookie-uri strict necesare pentru fluxul Google OAuth. Nu folosim în prezent cookie-uri publicitare sau instrumente proprii de profilare comercială.",
        "Aplicăm măsuri precum conexiuni criptate, parole stocate sub formă de hash, control pe roluri, limitarea abuzului, verificarea webhookurilor, separarea mediilor și jurnale de securitate. Nicio măsură nu poate elimina complet riscul; dacă un incident impune notificarea persoanelor vizate, aceasta va fi făcută conform legii.",
      ],
    },
    {
      title: "9. Cât timp păstrăm datele",
      items: [
        "Datele contului, profilului și relațiilor sociale sunt păstrate cât timp contul este activ și ulterior numai cât este necesar pentru soluționarea cererilor, securitate ori apărarea drepturilor.",
        "Comenzile, facturile, plățile, rambursările și dovezile asociate sunt păstrate pe durata cerută de legislația fiscală și contabilă și, după caz, până la expirarea termenelor de prescripție.",
        "Tokenurile de activare și resetare expiră după 24 de ore. Datele folosite pentru limitarea automată a abuzului sunt șterse după expirarea ferestrei tehnice și a perioadei scurte de siguranță.",
        "Actualizările foto ale organizatorilor nu mai sunt afișate după 24 de ore. Fișierele și înregistrările aferente pot rămâne temporar în evidențele tehnice până la rularea proceselor de curățare și expirarea copiilor de siguranță.",
        "Accesul la grupurile evenimentelor, membri, mesaje, alerte și notificările asociate expiră la 24 de ore după finalul evenimentului. Datele sunt apoi șterse automat din sistemele active de procesul periodic de curățare; copii reziduale pot persista potrivit ciclului operațional configurat al copiilor de siguranță și nu mai sunt accesibile în aplicație.",
        "Pachetele de validare offline expiră la finalul evenimentului. Copia de pe dispozitiv este eliminată când validatorul revine în modulul de validare după expirare, o șterge manual sau se deloghează; până atunci poate rămâne stocată local, dar nu mai poate fi folosită în aplicație. Scanările sincronizate rămân în evidența de acces și securitate atât cât este necesar pentru soluționarea incidentelor și apărarea drepturilor.",
        "Pentru copiile de siguranță și jurnalele tehnice, durata depinde de ciclul operațional configurat, de necesitatea recuperării, securității și investigării incidentelor și de obligațiile legale aplicabile. Aceste date nu sunt folosite pentru funcțiile curente ale aplicației; criteriile aplicabile unei cereri pot fi solicitate la contact@code-lab.ro.",
      ],
    },
    {
      title: "10. Drepturile tale",
      paragraphs: [
        "În condițiile RGPD, poți cere acces la date, rectificare, ștergere, restricționare, portabilitate și te poți opune prelucrării bazate pe interes legitim. Când prelucrarea se bazează pe consimțământ, îl poți retrage fără a afecta legalitatea prelucrării anterioare.",
        "Conturile de participant pot fi șterse direct din Profil > Cont și securitate. Profilul, biletele și datele sociale asociate sunt eliminate, iar codurile QR nu mai sunt acceptate la validarea online. O listă de validare offline descărcată anterior se poate actualiza cu întârziere. Ștergerea contului nu inițiază automat o rambursare. Comenzile, plățile, rambursările și documentele fiscale se păstrează separat atât cât este necesar pentru obligațiile legale, contabilitate și apărarea drepturilor. Conturile de organizator și administrator se închid prin contactarea suportului la contact@code-lab.ro. Pentru celelalte drepturi, trimite cererea de la adresa asociată contului. Putem solicita informații rezonabile pentru verificarea identității și răspundem, de regulă, în cel mult o lună.",
      ],
      links: [{ label: "Exercită un drept", href: "mailto:contact@code-lab.ro" }],
    },
    {
      title: "11. Decizii automate și persoane minore",
      paragraphs: [
        "Folosim reguli automate pentru securitate, limitarea încercărilor și prevenirea rezervărilor abuzive. Aceste reguli pot bloca temporar o cerere, dar nu folosim decizii exclusiv automate care produc efecte juridice sau afectează în mod similar semnificativ o persoană în sensul art. 22 RGPD.",
        "SPOTTR nu este destinat copiilor sub 16 ani. Dacă aflăm că un cont al unui copil a fost creat fără autorizația necesară, vom lua măsuri pentru restricționarea sau ștergerea datelor, ținând seama de obligațiile legale aplicabile.",
      ],
    },
    {
      title: "12. Plângeri și actualizarea politicii",
      paragraphs: [
        "Dacă nu ești mulțumit de răspunsul nostru, poți depune o plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal, B-dul G-ral. Gheorghe Magheru nr. 28-30, Sector 1, București, sau la autoritatea competentă din statul în care locuiești ori lucrezi.",
        "Actualizăm politica atunci când se schimbă serviciile, furnizorii sau obligațiile legale. Data versiunii curente este afișată sus; pentru modificări importante vom folosi un canal adecvat de informare în platformă sau prin email.",
      ],
      links: [{ label: "Plângeri ANSPDCP", href: "https://www.dataprotection.ro/?page=Plangeri_pagina_principala" }],
    },
  ],
};

const enTerms: PublicLegalDocument = {
  eyebrow: "Legal document",
  title: "Terms and conditions",
  updatedAt: "October 1, 2026",
  intro: "These terms govern access to SPOTTR, use of its social features, and the purchase or reservation of tickets published on the platform.",
  sections: [
    { title: "1. SPOTTR operator and commercial roles", paragraphs: [`${companyEn} operates SPOTTR at spottr.ro. You can contact us at contact@code-lab.ro.`, "SPOTTR provides the technical infrastructure for event listings, orders, payments, ticket delivery and validation. The organizer named on the event page sets the offer, is responsible for delivering the event and is the trader selling or granting admission. CODELAB DEV S.R.L. supplies promotional services purchased by organizers."], links: [{ label: "Contact SPOTTR", href: "mailto:contact@code-lab.ro" }] },
    { title: "2. Acceptance, eligibility and accounts", items: ["By creating an account, booking a free ticket or submitting an order, you confirm that you have read these terms and that the information you provide is accurate.", "You must have legal capacity to enter into the contract. A minor may use the service only with the consent and supervision of a legal representative and subject to the organizer's age restrictions.", "You are responsible for keeping your credentials confidential and for activity through your account. Tell us promptly if you suspect unauthorized access."] },
    { title: "3. Events and admission methods", paragraphs: ["The organizer supplies the event description, date, venue, admission rules, ticket types, capacity, sales window, price and VAT treatment and is responsible for keeping that information accurate.", "An event may use paid SPOTTR tickets, free SPOTTR bookings or a link to an external ticketing provider. For external sales, the provider's and organizer's terms govern the contract, payment, delivery and refunds; SPOTTR does not process that order."] },
    { title: "4. Orders and availability", items: ["Selecting a ticket does not guarantee availability. Paid tickets are held temporarily while the payment session is active; an abandoned, unpaid or expired checkout does not create a ticket.", "A paid-ticket contract is confirmed after the payment is verified and the order is completed. A free-ticket booking is confirmed when the SPOTTR reservation is completed.", "Sold-out tickets and tickets outside their sales window cannot be ordered."] },
    { title: "5. Prices, fees, payment and invoices", paragraphs: ["Before payment, checkout shows ticket value, any discount, the ticketing and processing fee, and the total. The standard platform fee is 4% of the discounted ticket value plus RON 2.50 per ticket unless the organizer chooses to cover it. The ticket price includes applicable VAT according to the rate declared by the organizer.", "Stripe Checkout processes payment as a charge on the organizer's connected Stripe account. SPOTTR receives its platform fee through Stripe Connect and does not store full card numbers. Returning from Stripe does not by itself confirm payment; the order is confirmed only after verification.", "The organizer issues an invoice for a paid ticket order through its configured invoicing provider using checkout billing details. Free bookings do not generate an invoice. CODELAB DEV S.R.L. issues invoices to organizers for event-promotion services purchased from SPOTTR."] },
    { title: "6. Ticket delivery and use", items: ["After confirmation, the ticket is sent to the order email and is also available in the account for authenticated purchases.", "Each ticket contains a unique code and QR code. Do not publish or share them with anyone you do not trust; the first valid scan may be admitted.", "The organizer may verify tickets and apply lawful age, identity, conduct, prohibited-item and admission-time rules that were properly disclosed."] },
    { title: "7. Cancellation, rescheduling and refunds", paragraphs: ["If an event cancellation is approved in SPOTTR, the platform requests a full refund of each paid order, including any buyer-paid ticketing fee. The time until funds arrive depends on Stripe, the bank and payment method. Pending, failed or partial refunds are reconciled and may require manual review.", "Voluntary refund requests, rescheduling and event changes are subject to the organizer's policy and mandatory law. The 14-day withdrawal right may be excluded for leisure services supplied on a specific date or during a specific period under Romanian Emergency Ordinance 34/2014. This does not remove mandatory rights where an event is cancelled, not supplied or non-conforming."] },
    { title: "8. Social features and event groups", items: ["You may save events, follow organizers, add friends and indicate interest or attendance. Attendance visibility is managed from your profile.", "Ticket holders may create private event groups and send messages or help alerts to group members. This feature does not contact the organizer, emergency number 112, police, medical responders or other emergency services and must not replace them.", "Access to an event group, its messages and safety notifications expires 24 hours after the event ends. A periodic cleanup process then removes them from active systems; residual copies follow the configured operational backup lifecycle and are no longer accessible in the application."] },
    { title: "9. Content and conduct", items: ["Do not use SPOTTR for fraud, harassment, unauthorized access, deceptive resale, infringement, malware or unlawful content.", "Organizers warrant that they may publish uploaded text and images and remain responsible for permits, safety, capacity, staff and event delivery.", "We may remove content, limit features or suspend accounts where necessary for security, fraud prevention, legal compliance or user protection. Where appropriate, we will explain the reason and available steps."] },
    { title: "10. Service availability and liability", paragraphs: ["We use reasonable efforts to keep SPOTTR available, but maintenance, provider outages and technical incidents may occur. We will seek to preserve confirmed orders and reconcile payments whose result was not received immediately.", "CODELAB DEV S.R.L. is responsible for the SPOTTR services it supplies and does not exclude liability that cannot lawfully be limited. The organizer remains responsible for the event, admission, listing information, permits and performance of obligations to attendees."] },
    { title: "11. Complaints, governing law and changes", paragraphs: ["For an order or SPOTTR issue, email contact@code-lab.ro with the order email and order identifier, but never card details. You may also contact the organizer for event delivery issues.", "Consumers may contact Romania's National Authority for Consumer Protection and use its Alternative Dispute Resolution procedure. Romanian law governs these terms without limiting mandatory consumer protection rules or access to competent courts.", "We may update these terms for legal or functional changes. The current date and version appear on this page; changes do not remove rights already acquired through a confirmed order."], links: [{ label: "Send a request", href: "mailto:contact@code-lab.ro" }, { label: "ANPC alternative dispute resolution", href: "https://anpc.ro/sal/" }] },
  ],
};

const enPrivacy: PublicLegalDocument = {
  eyebrow: "Personal data",
  title: "Privacy policy",
  updatedAt: "October 1, 2026",
  intro: "This policy explains what personal data SPOTTR processes, why it is needed, who receives it, and how you can exercise your rights.",
  sections: [
    { title: "1. Controller and contact", paragraphs: [`${companyEn} is the controller for SPOTTR account administration, social features, platform security, orders and ticket operations. Contact us about personal data at contact@code-lab.ro.`, "The event organizer is an independent controller for event delivery, admission, attendee relations and its fiscal duties. Stripe processes payment and verification data under its own terms and privacy policy. The organizer's chosen invoicing provider processes data needed for fiscal documents."], links: [{ label: "Privacy contact", href: "mailto:contact@code-lab.ro" }] },
    { title: "2. Data we process", items: ["Account and authentication: username, email, password hash, Google identifier if selected, language, role, account status, sessions and activation or reset tokens.", "Profile and community: photo, bio, friendships and requests, followed organizers, saved events, attendance responses, preferences and notifications.", "Orders and tickets: buyer email, event, ticket types and quantities, historical order prices, promo code, payment status, Stripe identifiers, ticket code, validation, refunds and disputes.", "Billing: name, address, city, county or district, country and relevant fiscal data. If requested, we keep a separate reusable billing profile; we do not store card data.", "Organizer data: identity, company name and tax number, verification, agreement acceptance, Stripe Connect state, invoicing configuration, events, promotions, commissions and related documents.", "Offline validation: an authorized validator's device may download ticket identifiers, validation hashes, ticket types and scan data, together with a random device identifier. These data are used only for admission checks and syncing scans when connectivity returns.", "Technical and security data: IP address or cryptographic representations of it, session identifiers, device and browser type, request timestamps, errors, security logs and administrative actions."] },
    { title: "3. Location, maps and uploads", paragraphs: ["With device permission, SPOTTR reads current coordinates to center the map and calculate event distances locally. Current coordinates are not sent to the SPOTTR API. The map provider may infer the viewed area from requested tiles and receives technical data such as the IP address.", "Maps use OpenStreetMap data and CARTO services. Organizers use Google Maps Places to search for event venues. Profile pictures, banners and photo updates are stored in SPOTTR's media infrastructure and published content may be visible to other users."] },
    { title: "4. Purposes and legal bases", items: ["Contract and pre-contract steps: account management, authentication, requested social features, orders, free bookings, ticket delivery and validation, private groups and support.", "Legal obligations: fiscal and accounting records, lawful authority requests, consumer rights and legally required document retention.", "Legitimate interests: service security, fraud and abuse prevention, automated request limits, incident investigation, payment reconciliation, disputes and legal claims, balanced against user rights.", "Consent or explicit choice where required: device location permission and optional marketing communications. Permission can be withdrawn in device settings; SPOTTR does not currently send marketing newsletters without separate consent."] },
    { title: "5. Visibility within SPOTTR", paragraphs: ["Username, profile photo and bio may be public. Email, billing details, payment identifiers and ticket codes are not publicly displayed.", "Attendance visibility is enabled by default and can be disabled in Profile. When enabled, other users may see that you are attending or interested in an event, but not ticket codes or payment data. Event-group messages and alerts are visible only to that group's members."] },
    { title: "6. Recipients", items: ["SPOTTR does not sell personal data.", "The event organizer for order performance, admission, invoicing, cancellations, refunds and event-related incidents.", "Stripe and the organizer's connected Stripe account for checkout, payment, verification, fraud prevention, refunds and disputes.", "Oblio or SmartBill, as selected by the organizer, to issue, deliver and where configured report fiscal documents.", "Amazon Web Services for API, database, media, secrets and logs; Vercel for web hosting; Resend for transactional email.", "Google for sign-in and Google Maps Places when used; CARTO and OpenStreetMap for maps.", "Authorities, courts, auditors or advisers where legally required or necessary for legal claims."] },
    { title: "7. International transfers", paragraphs: ["Technology providers may process data in the EEA and, depending on service and support, in other jurisdictions. Any transfer outside the EEA must meet GDPR Chapter V requirements; the applicable mechanism depends on the provider and destination and may include an adequacy decision or Standard Contractual Clauses. You may request the destination and safeguard applicable to your processing at contact@code-lab.ro."] },
    { title: "8. Local storage, cookies and security", paragraphs: ["SPOTTR uses local or secure device storage for authentication sessions, cache and preferences, and strictly necessary cookies for Google OAuth. We do not currently use advertising cookies or our own commercial-profiling tools.", "Measures include encrypted connections, password hashing, role controls, abuse limits, webhook verification, environment separation and security logs. No measure removes all risk; legally required incident notifications will be made when applicable."] },
    { title: "9. Retention", items: ["Account, profile and social data are kept while the account is active and afterwards only as needed for requests, security or legal claims.", "Orders, invoices, payments, refunds and related evidence are kept for periods required by fiscal and accounting law and, where relevant, until limitation periods expire.", "Activation and password-reset tokens expire after 24 hours. Automated abuse-limit data is removed after its technical window and short safety period.", "Organizer photo updates stop being displayed after 24 hours. Related files and records may remain temporarily in technical systems until cleanup processes run and backups expire.", "Access to event groups, membership, messages, alerts and related notifications expires 24 hours after the event ends. A periodic cleanup process then removes the data from active systems; residual copies may remain under the configured operational backup lifecycle and are no longer accessible in the application.", "Offline validation packages expire when the event ends. The device copy is removed when the validator next opens validation after expiry, deletes it manually or logs out; until then it may remain locally stored but cannot be used in the application. Synced scans remain in admission and security records as needed for incidents and legal claims.", "For backups and technical logs, duration depends on the configured operational lifecycle, recovery, security and incident-investigation needs, and applicable legal duties. These data are not used for current application features; criteria relevant to a request can be obtained at contact@code-lab.ro."] },
    { title: "10. Your rights", paragraphs: ["Subject to GDPR conditions, you may request access, rectification, erasure, restriction and portability and may object to processing based on legitimate interests. Where processing relies on consent, you may withdraw it without affecting earlier lawful processing.", "Participant accounts can be deleted directly under Profile > Account and security. The associated profile, tickets and social data are removed, and ticket QR codes are no longer accepted by online validation. A validation list downloaded earlier for offline use can update with a delay. Account deletion does not automatically initiate a refund. Orders, payments, refunds and fiscal documents are retained separately only as needed for legal duties, accounting and legal claims. Organizer and administrator accounts are closed by contacting support at contact@code-lab.ro. For other rights, submit the request from the account email address. We may request reasonable identity verification and usually respond within one month."], links: [{ label: "Exercise a right", href: "mailto:contact@code-lab.ro" }] },
    { title: "11. Automated rules and children", paragraphs: ["Automated security, rate-limit and abusive-reservation rules may temporarily block a request. SPOTTR does not use solely automated decisions producing legal or similarly significant effects within Article 22 GDPR.", "SPOTTR is not directed to children under 16. If we learn that a child's account was created without required authorization, we will take appropriate restriction or deletion steps subject to applicable legal duties."] },
    { title: "12. Complaints and updates", paragraphs: ["You may complain to Romania's National Supervisory Authority for Personal Data Processing at 28-30 General Gheorghe Magheru Boulevard, District 1, Bucharest, or to the competent authority where you live or work.", "We update this policy when services, providers or legal duties change. The current version date appears above; material changes will be communicated through an appropriate in-app or email channel."], links: [{ label: "ANSPDCP complaints", href: "https://www.dataprotection.ro/?page=Plangeri_pagina_principala" }] },
  ],
};

export const publicLegalDocuments = {
  ro: { terms: roTerms, privacy: roPrivacy },
  en: { terms: enTerms, privacy: enPrivacy },
} as const;
