# SPOTTR — reluare după pauza cerută de utilizator

Actualizare: utilizatorul a cerut reluarea și lucrul a continuat. Vezi `outings-redesign-2026-11-03.md` pentru schimbările și verificările finale ale reluării. Ultimele cerințe: poze reale ca în Home, eliminarea Find friends/Quick Connect de pe Friends, numărul mare centrat deasupra zilei/lunii prescurtate. Utilizatorul cere acum explicația completă a planului de ieșire pentru a se consulta cu ChatGPT; designul încă nu este aprobat. Nu interpreta paragraful istoric de pauză de mai jos ca o cerere nouă de oprire.

Pauză explicită cerută pe 3 noiembrie 2026. Nu continua automat: reia când utilizatorul cere.

## Prioritatea la reluare

**Designul NU este aprobat și NU este terminat.** Utilizatorul a respins repetat aspectul secțiunii. Nu prezenta starea actuală drept design final sau drept rezultat acceptat.

Cererea inițială: toate cele șase îmbunătățiri pentru „Where are we going?” / „Unde ieșim?”, împreună cu un redesign coerent în React Native și Next.js. Utilizatorul a extins explicit critica la întregul parcurs: lista planurilor, Make/New plan, selecția prietenilor, Friends și pagina grupului.

Preferințe explicite:

- Negru, suprafețe gri și accentul roz SPOTTR; păstrează identitatea aplicației.
- Pentru lista de planuri: carduri relativ subțiri, gri, ziua mare în stânga și luna dedesubt, **fără chenar părinte** în jurul secțiunii. „Home” în discuție include și secțiunea planurilor de pe Friends.
- Au fost încercate succesiv mai multe versiuni de carduri; niciuna nu a primit acceptarea finală. Nu reveni la ciclul de variante fără să verifici mai întâi întregul ecran.
- Utilizatorul a furnizat două imagini de inspirație: un planner mobil Taskly (carduri, avataruri suprapuse, progres și capsule), respectiv o aplicație de evenimente cu fotografii, date bine evidențiate și capsule cu participanți. Sunt **direcții de inspirație, nu copii 1:1**. Adaptează la negru/gri/roz, nu la alb/portocaliu.
- Ultimul feedback înainte de pauză: „până și restul ecranelor sunt varză make a plan friends pagina grupului tot”. Trebuie evaluat și corectat ansamblul, nu doar cardurile.
- Nu modifica navbarul, fizica blobului, Search, alte ecrane sau Liquid Glass deja acceptat în alte părți.

Skilluri citite/aplicate în această sesiune: better-layout, better-writing, better-ui; build-design pentru imaginile furnizate. animate a fost citit pentru orientare, dar nu s-a introdus un sistem nou de animații. Pages skills sunt dezactivate de instrucțiunea developer curentă.

## Ce este implementat în cod

### Reguli și API pentru planuri

Fișiere centrale:

- `api/internal/outings/planning.go`
- `api/internal/outings/planning_read.go`
- `api/internal/outings/planning_updates.go`
- `api/internal/outings/plans.go`, `handler.go`
- migrarea `api/internal/database/migrations/20261103180000_outing_nights_and_group_decisions.sql`
- `packages/api-schema/outings.tsp`, OpenAPI/clientul generate
- `packages/app-core/src/outings/model.ts`, `presentation.ts`, `planningCopy.ts`

Comportament implementat:

1. O seară este 06:00–06:00 în Europe/Bucharest, inclusiv după miezul nopții și schimbarea orei. Datele și căutarea propunerilor folosesc aceeași regulă.
2. Creatorul propune 1–3 seri; membrii acceptați răspund yes/maybe/no. Creatorul confirmă data înainte de propunerile de evenimente. Cererile vechi cu o dată fixă rămân compatibile.
3. Reacții independente la mai multe evenimente; vechiul endpoint de vot fără `answer` păstrează comportamentul vechi. Buget personal opțional, privat. Grupul vede numai câte bugete acoperă o opțiune. Estimarea pentru un bilet include taxa cumpărătorului, cu formula existentă și excepția organizatorului care absoarbe taxa. Nu se inițiază checkout/plată.
4. Termen de decizie; voturile/propunerile/răspunsurile se închid la termen, creatorul poate confirma sau prelungi. Contorizarea răspunsurilor și actualizări prin long polling, doar în ecranul activ și foreground. Endpoint `/changes` durează maximum 8 secunde și verifică revizia/permisunile aproximativ o dată pe secundă, fără conexiune DB ținută între verificări. Migrarea mai emite și NOTIFY; **nu există un hub LISTEN implementat**, clientul folosește long polling.
5. Plan B: creatorul redeschide alegerea evenimentului, cu verificarea reviziei/idempotentă; se păstrează istoricul și evidența deținătorilor biletelor pentru alegerile anterioare. Nu se anulează, transferă, rambursează sau cumpără bilete. Se resetează voturile, întâlnirea și sosirile pentru noua rundă. Data/orașul rămân ale planului.
6. După alegere: acces la QR-ul existent, legătură la Event Night, întâlnire de grup cu oră opțională și sosiri manuale. Sosirea manuală nu acordă acces la eveniment sau la funcțiile private de ajutor. Drepturile biletelor și ale safety group rămân verificate de API.

Privacy: cei cu invitație pending primesc doar contextul și serile propuse, fără membri/reacții/bugete/bilete/întâlnire. Doar bugetul propriu este returnat; ceilalți primesc numere agregate.

Notificări: tipurile de termen/redeschidere au texte comune RO/EN și navighează spre Outings în ambele aplicații. Workerul generează o singură notificare înainte de termen și una către creator după termen. Nu s-a testat push pe un telefon fizic.

### Interfața curentă, încă de rafinat

React Native:

- `src/outings/OutingsScreen.tsx`, `OutingPrimitives.tsx`, `PlanBuilder.tsx`, `PlanDetails.tsx`
- noi `PlanReady.tsx`, `journeyStyles.ts`
- `src/social/FriendsHome.tsx`, `components.tsx`, `src/screens/FriendsScreen.tsx`
- modificări de suprafețe neutre în `src/safety/SafetyGroupScreen.tsx`

Next:

- `src/features/outings/OutingsPage.tsx`, `OutingPlanBuilder.tsx`, `OutingPlanDetails.tsx`, `OutingPrimitives.tsx`, `outings.module.css`
- nou `PlanReady.tsx`
- `src/features/friends/FriendsHub.tsx`, `friends.module.css`
- `components/social/FriendsSheet.tsx`, `FeedActivityCard.tsx`, `ProfileConnectionQr.tsx`
- `components/SearchPopover.tsx`
- modificări de suprafețe neutre în `app/events/[id]/group/EventSafetyGroupPageClient.tsx`

Starea UI:

- Lista are carduri gri cu data mare în stânga, stadiu, titlu, context și avataruri/răspunsuri reale; fără containerul exterior de pe Friends.
- New plan are doi pași: nume/oraș/seri/termen, apoi selectarea prietenilor. Termenul și explicațiile se deschid separat. Câmpurile sunt gri, nu bordate alb.
- Selectorul existent `DateTimeField` a primit props **opționale** `triggerContent`, `triggerStyle`, `triggerHeight`, `hideLabel`, ca tile-urile de seară să poată folosi pickerul existent. Comportamentul implicit pentru celelalte ecrane rămâne păstrat; testele pickerului au trecut.
- Pagina planului are un header gri cu avataruri și progres, propuneri/răspunsuri, buget într-un modal și o listă de membri extensibilă. PlanReady reutilizează vizualizatoarele QR existente.
- Friends are creare plan în header, căutare și QR compacte. `SearchPopover` are `triggerLabel` opțional și `ProfileConnectionQr` are `compact` opțional; apelanții vechi păstrează prezentarea implicită.
- Modificările SafetyGroup sunt de stil, nu de autorizare, invitații, chat sau ajutor.
- Au fost introduse fotografiile de profil reale în avatarurile planurilor; fallback la inițiale dacă lipsesc/eșuează. API-ul vechi poate să nu trimită încă noile câmpuri.
- Unele butoane secundare încă au conturul puternic din `ActionButton` comun. La pauză era identificat acest aspect ca posibilă sursă de incoerență; **nu modifica global componenta fără a controla efectul în celelalte ecrane**. Nu s-a implementat o variantă nouă de buton.

### Login Next.js — cerere separată rezolvată în cod

- `apps/pulse-app/src/app/login/page.tsx`: completarea automată și valorile restaurate de browser rămân editabile și **nu** trimit formularul automat. Autentificarea pornește explicit prin Enter/submit sau buton.
- Nu s-a dezactivat comportamentul nativ iPhone al aplicației React Native.
- `apps/pulse-app/scripts/login-submit.test.cjs`: două teste trecute, inclusiv autofill → modificare cont → submit explicit, protecție dublu Enter și retry.
- Utilizatorul încă nu a confirmat manual remedierea pe browserul său.

## Verificări efectuate

- Codegen TypeSpec/OpenAPI reușit.
- Go `outings`, `notifications`, `safetygroups` au trecut pe PostgreSQL local izolat, cu toate migrările. Testele noi sunt în `group_decisions_integration_test.go`; verifică invitații, roluri, reacții multiple, buget privat/taxa totală, întâlnire, sosire, Plan B, păstrarea biletelor și DST.
- Toate cele 105 teste app-core au trecut. Log: `apps/spottr-native/artifacts/outings-core-tests.log`.
- 29 teste Native pentru social, safety și pickere au trecut.
- TypeScript pentru ambele aplicații a trecut pe parcursul iterației; **repetă verificarea finală după ultimele retușuri vizuale**.
- Arhitectura a trecut: 673 fișiere, fără importuri între aplicații sau căi private ale pachetelor.
- Browser QA Native-web și Next a trecut pentru întregul flux: listă, Friends/sheet, formular în doi pași, răspuns pentru seară, propunere, buget, vot, alegere, întâlnire, sosire, Plan B, invitații și transferuri, Event Night/ajutor/garderobă. Date/API simulate; nu plăți sau conturi reale.
- Viewporturi 320, 390 și 1024; screenshoturi în `apps/spottr-native/artifacts/outings-{native-web|web}-*.png`.
- Nu există verificare finală pe iPhone/Android fizic și nici build semnat.

Comenzi browser, din rădăcină, cu Node local:

```powershell
$env:NAVIGATION_TEST_URL='http://localhost:8083'
$env:OUTINGS_TEST_PLATFORM='native'
node apps/spottr-native/tests/browser-outings.cjs
# Next: 8084 și OUTINGS_TEST_PLATFORM='web'
```

Testele browser folosesc date simulate. Nu confunda trecerea lor cu aprobarea designului utilizatorului.

## Ce mai trebuie făcut la reluare

1. Verifică împreună toate ecranele pornind de la referințele utilizatorului. Prioritate absolută: coerența și calitatea designului pentru **tot** parcursul. Nu relua schimbarea izolată a cardurilor și nu presupune că aspectul curent este acceptat.
2. Verifică și corectează suprafețele, butoanele secundare, selecțiile, câmpurile, spacingul și header-ele. Verifică 320/390 px și texte RO/EN, inclusiv nume lungi, 3 seri și mulți prieteni. Menține navbarul/Liquid Glass și animațiile deja acceptate în afara secțiunii.
3. Verifică vizual ruta reală a grupului privat, nu doar Event Night; testele funcționale actuale nu certifică noua prezentare a chatului pe dispozitiv.
4. Închide problemele mici rămase: feedback/retry pentru încărcarea prietenilor din composer; mesaje clare pentru întâlnire invalidă; condiționarea acțiunilor după încheierea serii. Verifică și consistența helperelor vechi de vot cu reacțiile multiple.
5. Repetă TypeScript, verificarea arhitecturii, QA browser și testele afectate după designul final. Dacă se mai schimbă API-ul, regenerează clientul și rulează integrarea izolată.
6. Actualizează `docs/outings-and-ticket-transfers.md`: descrie încă vechiul vot unic/data fixă, deci nu mai reflectă această implementare. Adaugă un raport QA nou fără a reutiliza calificativele/review-urile istorice ca dovadă pentru codul nou.
7. Revizuiește toate modificările acestei sarcini, inclusiv migrarea, concurența și privacy. Există multe modificări anterioare necomise pentru calendar, hartă, Liquid Glass etc.; nu le șterge și nu le include accidental într-un revert.
8. Backendul și migrarea trebuie livrate înainte ca noile funcții să funcționeze cu serverul real. Nu a fost făcut deploy, commit sau push. Nu porni recuperare AWS/deploy automat: autorizația anterioară era doar pentru teste locale.

## Mediu și servicii locale

- Workspace: `E:\CODELAB DEV S.R.L\platforma-petreceri\pulse-platform-monorepo`.
- Nu porni/închide/reporni serverele utilizatorului pe **8081/8082**.
- Preview-ul agentului Expo existent pe **8083** a fost reutilizat.
- Next al agentului a fost pornit pe **8084** (`next dev --port 8084`), session exec `27060`; listener observat înainte de pauză PID 24124. PID-urile nu sunt autorizație de oprire la reluare: reverifică proprietarul/command line.
- PostgreSQL QA separat: `127.0.0.1:55433`, utilizator `spottr_qa`, baza `spottr_security_test`, fără parolă, auth trust limitat la listenerul localhost. DSN de test: `postgres://spottr_qa@127.0.0.1:55433/spottr_security_test?sslmode=disable`.
- Clusterul este în `apps/spottr-native/artifacts/outings-pg`; este creat exclusiv pentru această sarcină, separat de serviciul PostgreSQL existent pe calculator. Nu atinge bazele existente sau producția.
- Utilitare PostgreSQL: `C:\Program Files\PostgreSQL\18\bin`.
- Node: `C:\Users\zucco\AppData\Local\mise\installs\node\24.18.0\node.exe`.
- Go: `C:\Users\zucco\AppData\Local\mise\installs\go\1.26.5\bin\go.exe`, care folosește toolchainul 1.26.10 din cache. Go/tsx/browser au necesitat uneori `require_escalated` pentru acces la cache/host; aceasta nu a însemnat acces AWS.
- Shell PowerShell cu `login:false`. Pentru scripturi Node prin pipe, setează `$OutputEncoding=[System.Text.UTF8Encoding]::new($false)`; altfel caracterele Unicode din script devin `?`. Normalizează CRLF când folosești markeri text în scripturi de editare.
- `Get-CimInstance Win32_Process` a fost refuzat în sandbox la salvarea pauzei. Nu interpreta acest lucru ca eroare a aplicației.

Codul este pe disc și necomis. Nu s-a dat revert la munca făcută când utilizatorul a cerut pauza.
