# Friends — alegerea evenimentului și participarea

Brief curent: fișierul atașat `f0b14337-ebd2-4de8-b66f-21e09908d9aa/Pasted text.txt`, citit integral. Înlocuiește disponibilitatea / Maybe ca mecanism principal. Implementare și verificări locale, fără deploy sau migrări pe serverele reale.

## Implementat

- Distribuirea unui eveniment rămâne un mesaj în grup. Acțiunea explicită „Propune pentru ieșire” creează ori reutilizează ieșirea potrivită, cu contextul evenimentului; un eveniment cunoscut confirmă direct destinația. Grupul și conversația rămân permanente.
- Invitația concretă din chat și detaliul evenimentului folosesc aceeași sursă de date și controale reutilizabile: „Vin” / „Nu vin”, selecție indicată prin bifă și contrast, răspuns modificabil. Lipsa răspunsului rămâne distinctă. Nu există Join plan înainte de participare.
- Comparația conține propuneri compacte, fotografie, data/ora reală, locație și preț total când API-ul îl furnizează. Fiecare are un singur „Aș merge”, activabil/dezactivabil. Se pot susține mai multe evenimente, fără reordonare la vot.
- Creatorul confirmă separat destinația. Preferințele și disponibilitățile vechi nu sunt convertite în participare. După alegere, evenimentul, persoanele și biletele sunt principale; alternativele se extind la cerere.
- Editorul principal are o singură seară și un oraș, cu opțiune de eveniment cunoscut. Datele vechi cu mai multe seri rămân în backend; inițiatorul le poate fixa prin același editor. Modificările cu impact cer confirmare, păstrează biletele la evenimentul original și resetează răspunsurile incompatibile.
- Participarea și proprietatea biletelor rămân separate. Se pot selecta manual membrii acceptați, inclusiv pentru achiziție suplimentară; confirmarea explicită este necesară pentru acces deja existent. Starea necunoscută nu este prezentată drept „fără bilet”, nu este selectată automat și cere o confirmare explicativă.
- Scurtătura „Selectează participanții fără bilet” folosește doar participare confirmată și lipsă verificată a accesului. Nu restrânge selecția manuală. Ofertele neacceptate, plățile în verificare, inventarul și fereastra de transfer păstrează protecțiile existente.
- Friends, conversațiile, colecțiile, selectorul și detaliul folosesc aceeași familie de fotografii, rânduri și tipografie. Mesajele primite păstrează ora sub bulă. Navbar-ul și animația Search din Discover nu au fost modificate în acest pas.

## Eliminat din parcursul principal

- Răspunsul obligatoriu la disponibilitatea unei seri.
- Dropdown-ul și cele trei răspunsuri pentru fiecare propunere.
- Maybe ca alegere de participare.
- Comparația afișată dominant după confirmarea destinației.
- Confirmările succesive ale aceleiași participări.

Nu au fost șterse tabelele ori disponibilitățile istorice și nu s-au migrat automat persoane sau mesaje.

## Reutilizat și adaptat

- Grupurile permanente, mesajele, apartenența și permisiunile reale.
- Propunerile și preferințele existente, participarea per rundă, editorul cu revision și confirmare de impact.
- Checkout-ul, biletele individuale, ofertele/acceptarea transferurilor și confirmarea extraConfirmed.
- Componentele Spottr Back, ActionButton, sheets, meniuri, fotografii/avataruri, Glass și fallback.
- Închiderea întrebărilor istorice prin snapshot-ul mesajului; o întrebare veche nu primește răspunsurile altei seri.

## Contract API

`POST /outings/plans/{id}/vote` primește acum `{eventId, remove:true, revision}` pentru retragerea preferinței proprii. Activarea rămâne `{eventId, answer:"yes", revision}`. Operația nu șterge preferințele altor persoane/evenimente și nu creează plăți, mesaje ori participări. Conflictele de revizie și autorizarea sunt verificate de server. Schema TypeSpec, OpenAPI și tipurile generate au fost actualizate.

Migrarea aditivă `20261115200000_group_message_context.sql` păstrează contextul mesajelor noi; istoricul fără snapshot rămâne consultabil. Noile endpoint-uri/contextul și migrațiile grupurilor trebuie publicate împreună în etapa de release. În această sesiune s-a folosit exclusiv baza izolată `spottr_security_test` pe loopback.

## Verificări executate pentru noul flow

- 43 teste `apps/spottr-native/tests/group-*.test.ts`: trecute. Lifecycle, tastatură/scroll, drafturi, refuzuri API, anulare, navigarea biletelor gratuite pe iOS/Android/web, proprietate necunoscută și confirmare de bilet suplimentar.
- 74 teste comune de grupuri/prezentare/paginare/eligibilitate: trecute. Legacy Maybe rămâne separat, invitațiile nu sunt numărate drept răspunsuri, preferințele multiple nu devin participare.
- Go/PostgreSQL real local: `go test ./internal/outings ./internal/interactions -count=1 -timeout 180s` — ambele pachete trecute. Include noile teste `TestGroupEventSupportToggleKeepsIndependentChoices` și `TestGroupFreeTicketsForSelfFriendAndExplicitExtra`.
- React Native Web cu API sintetic și navigare reală (`browser-friends-coherence.cjs`): trecut. Două identități, răspuns ținut în așteptare, un singur mesaj de eroare/retry, selecție neoptimistă, preferințe multiple și retragere, alegerea creatorului, modificarea datei, self/friend-only/multiple/extra free-registration, invitații, catalog gol/eroare, opt propuneri, titluri lungi, 320 px și text mărit la 135%.
- React Native Web cu handler-ele Go reale și PostgreSQL izolat (`browser-friends-coherence-api.cjs`): trecut. Două conturi sintetice, acceptarea invitației, distribuire fără ieșire, propunere explicită, modificarea participării chat/detaliu/reload, alternativă fără duplicare, preferințe multiple/retragere, ordine stabilă, alegerea creatorului și editorul real de dată cu confirmare de impact.
- Next.js cu două conturi pe API Go/PostgreSQL local (`groups-real-api.browser.cjs`): trecut inclusiv după uniformizarea butoanelor ActionButton. Testul își readuce doar ieșirea sintetică în comparație prin endpoint-urile autorizate, păstrând istoricul.
- Next.js cu navigare reală/date sintetice (`groups-coherence.browser.cjs`): trecut. Draft păstrat între chat/detaliu, eroare unică la preferință și retry, pending fără selecție simulată, prevenirea scrierii duble, mai multe preferințe, context legacy fără disponibilitate, ecran îngust și capturi Home/Discover.
- Export JS iOS: trecut, 4664 module și 44 assets, în `apps/spottr-native/artifacts/friends-event-choice-ios`. Nu reprezintă build Xcode sau verificare pe dispozitiv.
- Architecture check: trecut, 740 surse.
- TypeScript React Native, Next.js și pachetul comun: trecute în verificarea finală, folosind compilatorul declarat de fiecare proiect. Pentru React Native acesta este TypeScript 6.0.3; compilatorul 5.9.3 din rădăcină produce incompatibilități în scanner/testele de hartă și nu este comanda acestui proiect.

## Verificare vizuală efectuată

Capturile au fost deschise și inspectate direct pentru invitație, comparația evenimentelor, creator/membru, eroare de răspuns, Friends și Home. Au fost folosite aceleași evenimente sintetice pentru comparația cu Home și Discover. Ultimul polish Next folosește ActionButton existent și propuneri fără containere gri suplimentare. Capturile și rezultatele se află în `apps/spottr-native/artifacts/friends-coherence-*` și `groups-coherence-next-*`.

Rapoartele mai vechi de browser și backend descriu faza anterioară cu trei răspunsuri; acea compoziție este înlocuită de acest brief. Nu sunt prezentate drept acceptare a noului flow.

## Limite reale

- Nu s-a făcut o plată Stripe reală. Cumpărarea a fost verificată prin UI cu transport sintetic și prin înregistrări gratuite reale pe handler-ele de ticketing și inventarul din baza izolată.
- Autentificarea browserelor folosește exclusiv identități de test; JWT login, email și push nu sunt acoperite de această verificare.
- Nu s-a verificat vizual pe iPhone/Android fizic. Liquid Glass, gesturile și tastatura nativă necesită verificare pe dispozitiv.
- API-ul nu distinge explicit „intrare fără bilet” de „niciun tip de bilet configurat”; UI păstrează fallback-ul către pagina evenimentului.
- Comanda existentă i18n-audit a eșuat din cauza unei căi vechi către `apps/pulse-app/src/i18n/resources.ts`. Resursele reale sunt în pachetul comun; nu raportez acel audit ca trecut.

