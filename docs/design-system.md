# Spottr — sistemul de interfață

Reguli și componente introduse în prima etapă a auditului global. Nu toate paginile și overlay-urile legacy au fost migrate; starea lor este în [audit](interface-consistency-audit.md) și în [inventar](interface-coverage.json).

## Sursa valorilor

[tokens.json](../packages/design-system/tokens.json) definește culori, raze, scară tipografică, spațiere, controale și durate. Native importă direct JSON-ul; CSS-ul web este generat și verificat înainte de build.

    node tools/sync-design-tokens.cjs
    node tools/sync-design-tokens.cjs --check
    node tools/interface-inventory.cjs --write

Fișierul CSS generat se comite împreună cu JSON-ul. Build-ul verifică sincronizarea, nu rescrie automat tema.

## Identitate și roluri

| Rol | Regulă |
| --- | --- |
| Brand | Rozul Spottr #ff0044 rămâne în identitate, iconuri, hartă și accente |
| Acțiune primară | #d9003a cu text #ffffff; contrast aproximativ 5,24:1 |
| Secundar | Suprafață ridicată, text deschis, contur vizibil |
| Pericol | Suprafață închisă și text/contur danger; nu doar o diferență de culoare |
| Succes / avertizare | Roluri semantice, nu variante de primary alese local |
| Câmp | Suprafață stabilă, contur inputBorder, text editabil de minimum 16 px pe mobil |
| Focus | Token focus #ff0044: contur de 2 px, în forma controlului, uzual offset 3 px; Highlight în forced colors |
| Separare focus / accent | Token focusHalo #000000; primary folosește halo 6 px la offset 3 px, ca inelul să contrasteze cu halo-ul, nu cu fundalul roșu al butonului |
| Sticlă / blur | Navigație plutitoare și controale peste media, nu fundal implicit pentru formulare |

Albul pe rozul brandului are aproximativ 3,94:1: suficient pentru anumite iconuri, nu pentru etichete normale de 12–16 px. Nu reutiliza brand ca fundal pentru text mic alb.

## Forme și tipografie

- Font: Inter, cu fallback de sistem până se încarcă.
- Câmp: 12 px; suprafață: 16 px; dialog: 20 px; buton principal: pilulă.
- Control obișnuit și icon button: minimum 44 px; variantă mare: 52 px; compact: minimum 40 px.
- Calendarul dens păstrează celule de minimum 24 px în ambele direcții, fără a depăși viewport-ul de 320 px.
- Corp: 16/24; etichetă: 14/21 semibold; metadate: 12/18; secțiune: 18; titlu: 28. Fonturile și dimensiunile locale rămase se migrează gradual.
- Butoanele permit etichete pe două rânduri; nu le fixa înălțimea astfel încât traducerile să fie tăiate.

## Componente

| Funcție | Web | Native |
| --- | --- | --- |
| Acțiune | ActionButton / ActionLink / IconButton | ActionButton; Button existent îl compune |
| Formular | Field + Input / TextArea; FormField existent compune Field | Field + FormInput; dashboard/common.Field compune Field |
| Select | ThemedSelect | DashboardDropdown |
| Structură | Surface / PageHeader / Badge | Surface / PageHeader / Badge |
| Feedback | StatusNotice; RequestError îl compune | StatusNotice; Loading / Feedback îl compun |
| Dialog nou | ModalFrame + ModalHeader | AppModal; Confirm existent îl compune |

Componentele sunt în directoarele components/ui și ui ale celor două aplicații. Variantele de business pot păstra numele și API-ul local, dar compun primitiva comună. Clasele și style-urile consumatorului sunt pentru layout; culorile și geometria acțiunilor se aleg prin tone/size, nu prin override-uri locale.

### Contracte

- Button este pentru comandă; ActionLink pentru navigație. Butoanele au implicit type=button; în formulare folosește explicit type=submit.
- busy păstrează eticheta, anunță starea și blochează interacțiunea. disabled este pentru indisponibilitate. O stare nu se exprimă doar prin opacity.
- Field primește eticheta și eroarea/indicația. Controalele comune primesc id, nume accesibil și descrierea erorii. Nu folosi placeholder drept singur nume pentru date de business.
- Pentru căutare și composer compacte este acceptată o etichetă accesibilă explicită; pentru date de facturare, cont și configurare folosește etichete vizibile.
- Surface este implicit un container div/View, nu o regiune semantică fără titlu.
- ModalFrame asigură top layer, fundal inert, Tab/Shift+Tab ciclic, Escape, safe area și restabilirea focusului. Confirmările pot seta initialFocusRef pe Anulează. În timpul unei operațiuni, setează dismissible=false și dezactivează și acțiunile explicite de închidere.
- Pentru Input bare cu icon, marchează containerul rotunjit cu ui-input-shell: acesta preia conturul focus-visible, fără un al doilea dreptunghi în jurul inputului interior. ui-input-shell--brand păstrează accentul formularelor de autentificare; forced-colors folosește Highlight. Inputurile bare fără shell își păstrează indicatorul propriu.
- Dropdown-urile folosesc focus pentru trigger și conturul opțiunii active, nu tokenul text. Accentul este verificat la minimum 3:1 pe suprafețele dark; în DOM, opțiunea activă a măsurat 4,46:1 normal și 4,11:1 când este și selectată. Pe media, pinii folosesc halo 8 px la offset 4 px. Containerele/tabindex=-1 focalizate programatic nu primesc automat conturul unui control; controalele operabile își păstrează indicatorii.
- ModalFrame urmărește visualViewport și pentru dialogurile cu câmpuri. AppModal folosește safe-area și KeyboardAvoidingView. Comportamentul fizic iOS/Android trebuie verificat separat.
- Mișcarea redusă oprește transformările feedbackului, animațiile Reanimated și animațiile CSS decorative. Temporizarea funcțională de 1,4 s a HoldForHelp rămâne neschimbată.
- Nu clona recursiv copiii pentru a schimba culoarea. Native folosește ActionTextContext pentru Text și proprietatea icon pentru iconul acțiunii; render props rămân intacte.

## Referință și verificare

Pagina internă /admin/style-guide este protejată de layout-ul admin. Prezintă controale și stări locale; nu creează comenzi și nu modifică datele contului.

    node --test apps/pulse-app/scripts/design-system.test.cjs
    node apps/spottr-native/tests/browser-interface.cjs
    node apps/spottr-native/tests/browser-input-focus.cjs

Testele browser cer preview Next pe localhost:49188 sau INTERFACE_TEST_URL local. Folosesc API simulate. Sunt verificate contrastul, busy submit, relația label/eroare, calendarul, focusul, safe area, 320 px și reduced motion. browser-input-focus verifică separat auth și conturul câmpurilor compuse, mouse/Tab, forced-colors și fallback-ul câmpurilor simple. Aceste verificări nu certifică automat restul aplicației.

## Direcția Liquid Glass — integrarea din 31 octombrie 2026

- Implementările Native GlassSurface, GlassPressable, AccentPressable și navigația nouă sunt referința vizuală. Nu le înlocui cu o suprafață opacă generică sau cu o animație paralelă.
- ActionButton compune AccentPressable cu fallback MotionPressable: pe iOS compatibil, primary folosește tint-ul brandului; fallback-ul Web/Android păstrează action și text alb. Busy, disabled, ref, semantica și contextul textului rămân în componenta comună.
- Press feedback Native păstrează calibrarea incoming: scale 0,98 / 85 ms la apăsare și 180 ms la eliberare. Mișcarea redusă și static pentru materialul nativ au prioritate; valoarea generică feedback=150 ms nu se aplică peste animația nouă a căutării.
- Un input bare poate declara focusOwner=container numai dacă acel container oferă indicatorul vizibil. Căutarea Discovery folosește conturul exterior, nu un dreptunghi pe inputul animat.
- Web urmează aceleași roluri, forme, tipografie și fallback-uri. Un redesign Liquid Glass complet al tuturor paginilor Web nu este inclus automat în acest pull.

Istoricul integrării, backup-urile și verificările sunt în [raportul de reconciliere](qa/liquid-glass-integration-2026-10-31.md). Redarea materialului pe iOS și compilarea Xcode necesită verificare separată pe Mac/dispozitiv.
