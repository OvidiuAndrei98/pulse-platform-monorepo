# Backlog: suport operațional SPOTTR

Înregistrat la 29 octombrie 2026, la cererea utilizatorului „ține minte astea”.
Status: propuneri păstrate pentru o etapă viitoare; această cerere nu autorizează implementarea lor acum.

## Scop

Unelte de suport în admin pentru problemele clienților și organizatorilor, inclusiv scanarea și orice zonă a dashboardului. Intervențiile trebuie să fie controlate, fără editări manuale improvizate în baza de date.

## Fișa clientului și a evenimentului

- Căutare după email, numărul comenzii, ID-ul biletului sau eveniment.
- Istoric relevant al operațiunilor, starea serviciilor și erorile disponibile.
- Asocierea sesizării cu versiunea aplicației și rapoartele tehnice disponibile; cod de diagnostic pentru suport, fără expunerea secretelor.

## Intervenții propuse

- Scanare: verificarea biletului și a istoricului validărilor, inclusiv cine și când a scanat; ultima sincronizare raportată de dispozitive; recuperarea scanărilor nesincronizate.
- Acces personal: verificarea drepturilor pentru scanner și garderobă, revocarea accesului și refacerea invitațiilor.
- Bilete și stoc: evidența vânzărilor și rezervărilor active/expirate; reluarea curățării rezervărilor expirate.
- Plăți: reverificarea la Stripe; reluarea emiterii biletelor numai după confirmarea plății, fără o nouă debitare și fără bilete duplicate.
- Email: retrimiterea confirmării și a biletelor existente.
- Facturi: afișarea motivului eșecului și reîncercarea emiterii, cu prevenirea duplicatelor.
- Garderobă: căutarea depunerii, numărului atribuit și istoricului predării/ridicării; corectarea unei atribuiri greșite cu motiv și audit.
- Publicarea evenimentului: identificarea blocajului și reîncercarea operațiunii eșuate.

## Diagnostic pentru organizator

Buton „Verifică scannerul” în dashboard: verifică permisiunea camerei, conexiunea cu API-ul, disponibilitatea/valabilitatea pachetului offline și scanările în așteptarea sincronizării. Oferă pași concreți de remediere și un cod de diagnostic pentru suport.

## Limite și protecții

- Fiecare intervenție înregistrează operatorul, motivul și rezultatul; accesul depinde de permisiuni.
- Nicio marcare arbitrară a comenzilor drept plătite. Confirmarea vine de la procesator, verificată pe server.
- Reîncercările trebuie să fie idempotente: fără plăți, bilete, facturi sau validări duplicate.
- Anularea unei validări nu este un reset liber: necesită drepturi speciale, motiv și verificarea sincronizării, pentru a evita intrarea de două ori cu același bilet.
- Un telefon complet offline nu poate fi reparat sau inspectat în timp real de la distanță. Scanările trebuie păstrate local, cu instrumente locale de recuperare; adminul arată ultima stare raportată și momentul ei.
- Nu introduce drept de refund general pentru client; politica discutată anterior rămâne refund în cazul anulării evenimentului.

## Comutatoare de urgență

Posibilitatea dezactivării temporare a unor funcții opționale problematice, de exemplu generatorul de story sau un efect vizual. Suportul pentru aceste comutatoare trebuie pregătit în aplicație; ele nu pot repara orice defect de la distanță și nu înlocuiesc un build nou pentru schimbări native.

## Ordine de lucru propusă

1. Scanare, diagnostic și accesul personalului.
2. Fișa clientului, recuperarea comenzilor cu plată confirmată și retrimiterea biletelor.
3. Facturare, garderobă, stocuri, publicare și celelalte operațiuni din dashboard.

La reluare, se verifică implementarea existentă înainte de a decide ce trebuie adăugat sau refolosit.
