# Spottr — audit de consistență vizuală

Data: 30 octombrie 2026. Runda curentă: inventar global și prima etapă de implementare a sistemului UI. Nu este o certificare WCAG și nu este un audit de securitate.

## Scope and coverage

Au fost inventariate 50 de rute Next (49 existente plus biblioteca UI internă), 19 ecrane Native și subsecțiunile de dashboard, admin, profil, feed, validare și garderobă. [Manifestul](interface-coverage.json) include dependențele UI tranzitive, toate layout-urile Next aplicabile și shell-ul Native App/providers/navigation. Scanarea AST acoperă 514 fișiere TypeScript/TSX; nu echivalează cu parcurgerea manuală sau în browser a fiecărei stări.

Rolurile din scope sunt vizitator, cumpărător, organizator, operator de validare/garderobă și admin. În verificările dinamice au fost folosite numai conturi, cameră și API simulate. Nu au fost făcute deploy-uri, comenzi reale sau modificări în AWS/Stripe.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Primitiva Field, controale comune, calendar, ModalFrame/AppModal, layout/zoom; regresii de tastatură și roluri | Contractele noi verificate; overlay-uri legacy HIGH rămân deschise |
| Layout | Bibliotecă UI, admin, validare, garderobă, discovery/hartă la 320 px și desktop; safe area simulată | Reflow verificat în aceste familii, nu în fiecare pagină/stare |
| Writing | Etichete și erori asociate; profil, invitații, promo, căutare; copy RO/EN | Relații corectate în primul lot; revizuirea tuturor textelor legacy continuă |
| Typography | Inter, scară comună, FormInput/Input, etichete și acțiuni | Roluri definite și aplicate controalelor migrate; titluri/metadate locale încă există |
| Colors | JSON, CSS generat, Native theme, controale, feedback și consumatori | Perechile comune trec contrastul; exemple legacy cu text pe brand rămân deschise |
| UI | Forme, stări, compoziție, suprafețe, calendare, wrapper-ele de business migrate | Foundation livrabil separat; uniformizarea globală nu este închisă |

## Ce este implementat

[Sistemul de interfață](design-system.md) definește culori semantice, Inter, tipografie, spațiere, forme, ținte și mișcare. Web și Native folosesc aceeași sursă JSON; build-ul web verifică CSS-ul generat.

Componentele comune includ ActionButton/Link/IconButton, Field/Input/TextArea, Surface/PageHeader/Badge, StatusNotice și ModalFrame/AppModal. Select-urile comune existente au fost păstrate și conectate la Field. Wrapper-ele Native Button, dashboard Action/Card/Heading/Field/Confirm, admin și garderobă compun componentele comune în loc să redefinească acțiunile.

Primul lot a migrat 56 de butoane și 75 de câmpuri prin înlocuiri mecanice, apoi acțiuni/linkuri și wrapper-e suplimentare au fost revizuite individual. Aceste numere descriu operațiunile de migrare, nu numărul total de controale uniforme din produs.

Principalele corecții:

- Brand #ff0044 separat de acțiunea cu text alb #d9003a: aproximativ 5,24:1 pentru text alb.
- Focus vizibil, zoom permis, câmpuri mobile de minimum 16 px, id/label/eroare asociate și nume pentru acțiunile icon.
- Busy submit dezactivează nativ butonul și blochează dublul click; clasele responsive de vizibilitate rămân funcționale.
- Calendar cu nume complete pentru date, selecție anunțată, roving focus și săgeți/Home/End/PageUp/PageDown. Schimbarea lunii păstrează o zi accesibilă prin Tab.
- Dialogurile migrate folosesc top layer, fundal inert, focus ciclic și returnat, Escape și safe area; dialogurile cu câmpuri urmăresc visualViewport.
- Mișcare redusă pentru CSS, Reanimated și animațiile Native Animated identificate în navigație/panouri/refresh. Temporizarea funcțională HoldForHelp nu este scurtată.
- Compoziția Native nu rescrie recursiv copiii; render props și identitatea copiilor arbitrari sunt păstrate.
- Profil, invitații, coduri promoționale, caption și căutări au primit etichete/nume asociate în lotul revizuit.
- Pagina protejată /admin/style-guide demonstrează componentele și stările fără scrieri pe date de business.

La migrare, reviewerul a identificat eliminări prea largi de clase decorative într-un script temporar. Diferențele au fost restaurate, au fost revizuite separat și au primit regresie de compoziție. Cele trei scripturi one-off nu sunt păstrate ca tooling permanent. Generatorul de tokens și inventarul read-only rămân.

### Corecție ulterioară — un singur perimetru de focus

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM, rezolvat | apps/pulse-app/src/styles/interface.css:87; app/register/page.tsx:294; app/login/page.tsx:185,204; app/forgot-password/page.tsx:55; app/users/me/friends/page.tsx:103; components/SearchPopover.tsx:200; components/social/FriendsSheet.tsx:92 (ultimele șase căi sunt relative la apps/pulse-app/src) | Inputul bare primea contur alb dreptunghiular în interiorul containerului rotunjit deja evidențiat | ui-input-shell preia conturul complet; numai inputul direct din shell renunță la outline-ul propriu; celelalte controale păstrează fallback-ul | Un singur indicator coerent, fără pierderea focusului vizibil din tastatură; Highlight în forced-colors |

Verificat în Chromium: înregistrare/login normal/resetare, pointer/Tab, etichete, forced-colors, shell generic și input bare standalone/input normal/textarea. Capturi inspectate la 390 și 1440 px. Next build, cele 61 de teste Web și browser-interface trec. Reviewer independent: ACCEPT, 9,5/10 pentru acest fix strict. Safari/Firefox și dispozitive fizice nu au fost rulate pentru această deltă; selectorul :has presupune baseline modern.

### Corecție ulterioară — focus comun pentru toate familiile de controale

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM, rezolvat | packages/design-system/tokens.json:16; apps/pulse-app/src/styles/interface.css:52; apps/pulse-app/src/features/events/form/themedSelect.module.css:7,17; apps/spottr-native/src/dashboard/DashboardDropdown.tsx:56 | Focus global alb și focusuri locale împrumutate din tokenul text; opțiune activă cu dreptunghi alb | Rol focus în accent, activ pe trigger/opțiune; halo separat pe primary, culori sistem în forced-colors; țintele programatice neoperabile excluse din fallback | Identitate consecventă fără eliminarea focusului vizibil (WCAG 2.4.7); contrast verificat pentru indicatorii modificați (1.4.11) |
| MEDIUM, rezolvat | apps/pulse-app/src/features/events/filters/DiscoveryToolbar.tsx:29; apps/pulse-app/src/features/events/filters/discoveryToolbar.module.css:5 | Căutarea din toolbar avea input complet în interiorul containerului și încă un focus pe container | Input bare în ui-input-shell; un singur indicator exterior și un singur buton explicit de închidere | Același contract ca celelalte câmpuri compuse, fără dreptunghi intern și fără X nativ duplicat |

Callerii locali verificați/migrați: calendar, garderobă, carusel/pini hartă, error-screen, plus variantele Native comune. Contrast măsurat: focus pe surface 4,83:1, raised 4,46:1, overlay 4,55:1 și halo 5,34:1; opțiune activă selectată, compusă în DOM, 4,11:1. Primary folosește halo 6 px / offset 3 px, pinii halo 8 px / offset 4 px, astfel încât nu comparăm două nuanțe roșii adiacente. Testele Web sunt acum 62 (51 + 11 contract tests); Native 529. Verificările browser includ select, halo, nume/rol AX, search și flow garderobă pe ambii clienți, plus harta Next. Reviewer independent: ACCEPT, 9,3/10 pentru contractul general de focus, fără findings critical/high/medium în această deltă. Nu este aprobare globală și nu include verificare pe Safari/Firefox sau hardware Native.

## Findings — ranked, încă deschise

| Severity | Domain | Location | Before / evidence | After / next change | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Accessibility | apps/pulse-app/src/features/wardrobe/Wardrobe.tsx:750; apps/pulse-app/src/app/dashboard/ticket-validation/page.tsx:1371; apps/pulse-app/src/components/SearchPopover.tsx:168 | Dialogurile custom au aria-modal/Escape în unele cazuri, dar nu întregul contract initial focus, containment, restore și inertness | Migrare la ModalFrame sau contract comun echivalent, apoi teste Tab/Shift+Tab/Escape/return | Un rol ARIA nu izolează singur tastatura de pagina din spate |
| HIGH | Accessibility | apps/pulse-app/src/components/social/EventFriendProfilePopup.tsx:80; components/tickets/TicketPreview.tsx:144; components/social/ProfileConnectionQr.tsx:150 | Ramuri desktop custom fără contract complet de focus; ramurile Vaul trebuie clasificate separat | Migrare/test separat pentru desktop, păstrând comportamentul gesturilor și back stack-ului mobile | Aceeași problemă de modalitate nu trebuie ascunsă de rezultatele bibliotecii UI |
| HIGH | Colors | apps/spottr-native/src/screens/AccountListScreen.tsx:66; apps/spottr-native/src/dashboard/managementUi.tsx:97 | CTA-uri legacy directe folosesc încă brand ca fundal pentru text mic deschis | Migrare la ActionButton ori token action; clasificare live/dead pentru celelalte apariții | Aproximativ 3,64–3,94:1 nu trece 4,5:1 pentru text normal |
| MEDIUM | Accessibility | apps/spottr-native/src/ui/AppSheet.tsx:11,54 | Proprietatea label numește grabber-ul de închidere, nu explicit întregul sheet | Separare între accessible title și close label, plus verificarea semanticii pe fiecare caller | Sheet-ul și comanda de închidere au roluri și nume diferite |
| MEDIUM | Accessibility | apps/spottr-native/src/admin/AdminScreen.tsx:67,102; overlaySources din manifest | Titluri vizuale fără trait header și modale Native cu implementări locale | Titluri importante prin PageHeader/header; clasificarea fiecărui Modal ca platform-managed sau AppModal/AppSheet | Un Text mare nu este automat un heading accesibil; existența wrapper-ului nou nu migrează toți callerii |
| MEDIUM | UI / Typography | Consumatori legacy enumerați în ownedUISources din manifest | Taburi, carduri de domeniu, heading-uri și metadate au încă reguli locale | Migrare pe familii, nu înlocuirea indiscriminată a formelor decorative | Aceeași funcție trebuie să aibă același contract; cardurile media și controalele de lucru pot avea roluri diferite |
| MEDIUM | UI / SSR | apps/pulse-app/src/app/login/page.tsx:33,39 | În verificarea suplimentară, URL-ul /login?activation=success a produs React 418: starea inițială dependentă de window diferă de SSR; problema exista înaintea fixului de focus | Inițializare identică server/client, apoi citirea parametrilor într-un mecanism compatibil SSR; test separat pentru ruta de activare | Recuperarea hidratării reconstruiește formularul; nu trebuie confundată cu problema CSS și nici ascunsă prin filtrarea consolei |
| LOW | Writing | apps/pulse-app/src/features/events/filters/DiscoveryToolbar.tsx; apps/spottr-native/src/screens/DiscoveryToolbar.tsx | Unele etichete compacte de interval folosesc ISO în loc de dată localizată | Formatter comun pentru text vizibil; ISO numai în stare/API | Coerență între etichetele toolbar-ului și carduri |

Aparițiile din manifest numite candidate sunt puncte pentru inspecție, nu vulnerabilități sau încălcări WCAG confirmate. De exemplu, Input poate primi numele prin Field, iar brand poate fi corect pentru un icon, un pin, un contur sau o tentă de selecție. Nu cerem zero apariții ale brandului în cod.

## Acoperire pe familii

| Familie | Sursă | Browser în runda curentă | Ce NU certifică |
| --- | --- | --- | --- |
| Root/layout/providers/nav | Scanate, relații în manifest | Navigație/roluri prin fixture-urile de admin/validare | Fiecare deep link și fiecare combinație de istoric |
| Biblioteca UI | Revizie directă | Focus, erori, busy, calendar, 320/desktop, safe area, reduced motion | Restul overlay-urilor aplicației |
| Discovery/hartă | Sursă și componente comune | Next și Native web: filtre/calendar/dropdown; Next: carusel, pin/card, zoom și revenire | 3D/gesturi pe hardware Native |
| Garderobă | Sursă și controale comune | Next: flow complet simulat; Native web: flow complet simulat | Focusul modalului camera legacy și camera fizică |
| Validare | Sursă și controale comune | Next și Native web: taburi, configurare, staff, draft, RO, 320/desktop | Contractul complet al scan-history overlay legacy |
| Admin | Sursă, layouts, primitives | Next și Native web: gate rol, liste/detalii organizatori, settings/issues, empty și dimensiuni | Fiecare modal/stare financiară reală |
| Profil/auth/cont | Sursă și primul lot de câmpuri/acțiuni | Regresii unitare; nu toate paginile au fost parcurse în browser în runda curentă | OAuth/emailuri reale, toate setările și screen reader fizic |
| Eveniment/checkout/grupuri | Sursă și primul lot de controale/culori | Regresii unitare de disponibilitate, promo, recuperare plăți și schimbare cont | Cumpărare/refund real, fiecare sheet/tastatură/stare de grup |
| Legal / pagini statice / callback-uri | Inventariate și incluse în graf | Build; fără revizie vizuală completă a fiecărei rute | Revizie juridică sau conținut legal nou |

## Verification

Reușite pe sursa curentă:

- Build Next și export Native web; Native typecheck.
- 529 teste Native.
- 51 teste web existente și 11 contract tests: contrast, CSS drift, busy submit, compoziție, geometrii procentuale, tone overrides, zoom, conturul unic al câmpurilor compuse și focus pe acțiuni/dropdown.
- browser-interface: contrast calculat în DOM, label/error, submit busy/Enter, calendar cu tastatura, focus ciclic/returnat, 320 px/desktop, safe area simulată și reduced motion.
- browser-admin-directory: Next și Native web, inclusiv gate de rol și liste/detalii/settings/empty/320.
- browser-validation-tabs: Next și Native web, inclusiv tastatură, retenția draft-ului, staff, RO și viewport.
- browser-map: Next, carusel/pin/card/gesturi/revenire și zoom.
- browser-discovery: Next și Native web, căutare/calendar/dropdown.
- browser-wardrobe Next și Native web: configurare, personal, alocare, predare parțială, recuperare, aprobarea clientului și responsive.
- diff check: fără erori de whitespace.

Not verified: iOS/Android fizic, VoiceOver/TalkBack, zoom real de browser la 200%, toate temele, RTL și toate stările fiecărei rute. Reflow la 320 px nu este prezentat drept test complet de text mărit. Rezultatele browserului Native web nu sunt rezultate de hardware Native.

## Verdict

ACCEPT pentru foundation + prima migrare: 9,0/10, acordat de reviewerul independent după verificarea sursei finale, documentației, manifestului, contract tests, token sync și diff check. În acest scope nu au rămas findings critical/high/medium. Scorul depășește pragul cerut de 8/10 și nu se aplică întregii aplicații. LOW/neblocant: variabilă wide nefolosită în FormInput, feedback vizual success încă simplu și contract tests rulate/documentate manual, fără integrare CI nouă în această etapă.

Block pentru o aprobare globală: rămân constatările HIGH de mai sus. Inventarul global este disponibil, însă migrarea și validarea fiecărei pagini/stări nu sunt încheiate. Următorul lot prioritar este familia celor șase overlay-uri Web, urmată de callerii Native și CTA-urile legacy, apoi taburi/suprafețe/titluri per familie.
