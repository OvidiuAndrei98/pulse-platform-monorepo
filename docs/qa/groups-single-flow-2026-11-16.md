# Grupuri — mesajul de referință și flow-ul continuu

## Implementare

Prototipul HTML a fost testat înainte de modificarea interfeței. Este folosit pentru comportament și ierarhie; interfața folosește fotografia, fonturile, suprafețele, butoanele, Back-ul și sheet-urile existente Spottr.

- Un eveniment este legat explicit de o ieșire prin `outingId` și `referenceMessageId`. Mesajul de referință evoluează din share în propunere/comparație și apoi în invitație cu răspuns personal. Autorul, textul, ora și ID-ul original rămân păstrate.
- Confirmarea destinației nu trimite încă un poster complet și nu răspunde automat pentru participanți. Actualizările de context păstrează istoricul, prezentat compact.
- Preferința pentru un eveniment și răspunsul la invitația confirmată rămân separate. Răspunsul poate fi modificat sau retras; eroarea păstrează ultima stare confirmată și permite retry.
- După alegere, alternativele devin compacte. Aceeași petrecere în două ieșiri rămâne în două contexte distincte. Nu există deduplicare globală după titlu, fotografie sau event ID.
- Colecția de evenimente preferă sursa originală în locul unui alias al aceleiași referințe explicite; conversația și istoricul brut nu sunt șterse.
- Referințele vechi sunt hidratate separat de pagina ultimelor mesaje, respectând vizibilitatea membrului. Citirea istoricului nu este mutată la ultimul mesaj doar pentru că s-a actualizat o referință.
- Editorul unei seri trecute nu mai afișează simultan vechea dată în titlu și ziua curentă selectată în bandă. Alegerea unei seri noi este explicită.
- Meniul cu o singură acțiune nu mai are un ScrollView interior; overscrollul meniurilor cu mai multe acțiuni este oprit.

## Checkout și bilete

Rezervarea înainte de apăsarea Pay este separată de plata în curs. Cumpărătorul poate continua același checkout; nu se creează automat o nouă comandă sau plată. Rezervarea nu este introdusă în tranzacții și nu constituie dovadă de plată.

`POST /checkout/recover` verifică autentificarea, cumpărătorul, evenimentul și starea furnizorului. Nu schimbă destinatarii sau destinația. O selecție devenită incompatibilă nu primește o capabilitate de plată. Închiderea checkoutului nefinalizat necesită o acțiune explicită și confirmare; o plată reușită în același timp rămâne plată reușită, fără refund automat.

Pe iPhone, sesiunea recuperată folosește PaymentSheet existent și este salvată securizat înainte de prezentare. Pe web este reluată sesiunea hosted existentă. Un checkout nativ nu este convertit într-o plată web nouă. Lipsa capabilității locale nu mai produce automat „invalid”: cumpărătorul poate verifica ordinul prin API. Biletele existente cu QR rămân accesibile inclusiv când există un checkout nefinalizat pentru bilete suplimentare.

Reviewerul a identificat și corectat un caz suplimentar: blocarea ferestrei de plată de către browser putea lăsa permanent starea busy. Retry-ul este acum verificat.

## Cauze demonstrate și limitele diagnosticului

1. `decisionState` permitea votul unei opțiuni cu `available:false`. Acțiunea este acum dezactivată, păstrând propunerea în istoricul contextului ei.
2. Asocierea anterioară din chat căuta o ieșire după event ID. Aceasta nu putea distinge două ieșiri cu aceeași petrecere. Asocierea este acum explicită.
3. Editorul păstra data veche, dar clampa separat markerul benzii la ziua curentă. Am eliminat această contradicție fără salvare implicită.
4. O rezervare pre-Pay putea refuza o nouă cumpărare cu `existing_payment`, deși participantul avea corect `ticketState:none`. Recuperarea comenzii existente este acum separată de confirmarea plății.
5. Confirmarea după order ID fără capabilitatea locală ajungea la „invalid”. Verificarea autentificată rezolvă acest caz fără autorizare bazată exclusiv pe ID.
6. La completarea unui gol din paginarea istoricului, o ramură cu `hasMore:false` păstra un indicator vechi `oldestMore:true`. Testul de regresie verifică eliminarea footerului devenit fals.

Filmul 23:37 a fost inspectat integral. Nu există requesturile originale ale erorii sale de checkout; nu atribuim retroactiv acea eroare unei cauze unice. Secvența de editare care se încheie cu Discard nu este prezentată drept refuz al salvării.

## Verificări executate

- Prototip HTML în Chrome: **19 verificări, 15 stări capturate**, fără erori runtime.
- React Native: **836/836 teste** în suita completă; log în `apps/spottr-native/artifacts/groups-single-flow-native-suite.log`. Regresiile adăugate ulterior pentru colecția comună și păstrarea QR sunt verificate separat.
- Ultima verificare nativă focalizată: **27/27**, după integrarea helperului comun de colecție și păstrarea QR alături de un checkout suplimentar. TypeScript nativ trece.
- Shared core: **111/111 teste** și TypeScript trecute.
- Traseu React Native Web → Go → PostgreSQL local: **72/72 verificări**, două identități, share/propunere, răspuns, retragere, retry după eroare injectată, alegere/realegere, context schimbat, două ieșiri pentru același eveniment, reveniri din selector și 55 de mesaje în istoric. Aceste acțiuni nu au apelat purchase/book.
- Next.js: TypeScript și **136 teste** trecute; traseu local cu două conturi incluzând cumpărarea gratuită pentru sine/prieten, confirmarea explicită a unui bilet suplimentar și acceptarea transferului. Detaliile și verificările recovery sunt în raportul Next de mai jos.
- După corecția paginării: **3/3 verificări suplimentare** în browser. Next recovery: **8 scenarii controlate**, plus verificarea reală HTTP a unei comenzi gratuite deja finalizate și refuzurile de autentificare/proprietate. Acestea nu reprezintă o plată Stripe live.
- Export JavaScript iOS: **4.670 module și 44 assets**, reușit. Acesta este un export de pachet, nu un build Xcode sau un test UIKit.
- Verificarea arhitecturii: **5 teste** trecute și scannerul de importuri fără încălcări.
- API recovery: PostgreSQL izolat și Stripe HTTP simulat local, inclusiv rezervare pre-Pay, procesare, expirare, anulare explicită, concurență cu succesul plății și izolarea cumpărătorilor. Nu s-au efectuat plăți Stripe reale.
- Pachetele Go `outings`, `payments`, `router` și `cmd` au trecut suitele complete; detaliile sunt în raportul backend.

## Dovezi și rapoarte

- [Auditul integral al filmării 23:37](groups-2337-reference-audit-2026-11-16.md).
- [Raportul verificărilor native/browser](groups-single-reference-native-browser-2026-11-16.md).
- [Raportul backend și shared core](groups-single-flow-shared-backend-2026-11-16.md).
- [Raport Next.js](../../apps/pulse-app/docs/qa/groups-single-flow-2026-11-16.md).
- Matricea și capturile React Native Web: `apps/spottr-native/artifacts/groups-reference-real-api-results.json`, `groups-reference-real-api-*.png`.
- Prototip: `apps/spottr-native/artifacts/single-flow-prototype-2026-11-16/`.
- Export iOS: `apps/spottr-native/artifacts/groups-single-flow-ios/`.

## Nevalidate și livrare

Nu s-a executat în această etapă o verificare fizică UIKit a meniurilor, tastaturii, Liquid Glass, scrollului sau PaymentSheet. Capturile Chrome și testele Yoga nu sunt dovezi pentru aceste comportamente native. Nu s-a făcut o plată Stripe reală și nu s-a emis o factură reală în verificări.

Backendul, contractele și clienții sunt implementate local. Serverul pe care este folosită aplicația trebuie să includă acest backend pentru noul flow complet; nu am făcut deploy sau migrări pe serverul real. Navbarul și animația Search din Discover nu au fost modificate în această etapă. Chatul automat al petrecerii nu a fost reintrodus.
