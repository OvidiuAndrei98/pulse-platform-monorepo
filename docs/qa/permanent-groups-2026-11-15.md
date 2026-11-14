# Grupuri permanente Spottr — implementare și verificare locală

Brief: `D:/CHROME DOWNLOADS/Spottr_Grupuri_Permanente_Brief_Codex.md`, citit integral (761 de rânduri). Acesta înlocuiește regulile contradictorii despre vechile planuri. Verificări încheiate pe 15 noiembrie 2026.

## Ce este implementat

În React Native și Next.js, Social păstrează prietenii și organizatorii urmăriți și oferă grupuri private permanente. Grupul are o conversație, iar ieșirile sunt obiecte separate în aceeași conversație. Nu se creează un grup când vizitezi un eveniment ori cumperi un bilet.

Parcursul integrat este: eveniment → trimite în grup existent sau creează grup și trimite atomic → invitații pending → „Hai aici” explicit → răspuns personal → cumpărare pentru sine/prieteni → bilet individual → a doua ieșire în același grup. Trimiterea unui eveniment nu creează singură o ieșire și niciun pas de planificare nu pornește automat plata.

- Grup: invitații acceptate explicit, refuz, redenumire, membri, transfer administrator, părăsire/eliminare și mute. Limita grupului este opt persoane. Administratorul grupului și inițiatorul ieșirii au drepturi distincte.
- Conversație: text și carduri reale de eveniment/ieșire, paginare prin cursor, mesaje virtualizate, draft păstrat la navigare, retry cu același ID, indicator de mesaje noi și citire până la ultimul mesaj efectiv încărcat. După eșecul confirmării de citire, următorul refresh focalizat reîncearcă acel cursor.
- Ieșire cunoscută: evenimentul și seara sunt preluate, fără poll artificial. Pentru alegerea unei seri există banda de zile reutilizată din Discover, doar în selector, cu lună/an și intervalul permis. Numai opțiunea explicită de alegere împreună permite până la trei seri.
- Propuneri: seara și orașul filtrează catalogul real; preferințele personale nu aleg destinația. Inițiatorul confirmă separat. Alternativele se pot propune fără schimbarea tacită a evenimentului; alegerea poate fi redeschisă autorizat.
- Ieșire confirmată: fotografie, dată/locație, răspunsurile membrilor și statusul dreptului individual de acces. Readiness vine de pe server și numără persoane confirmate, nu unități cumpărate. Un singur participant primește text personal; zero participanți nu produce „toți sunt gata”.
- Bilete: selecție de destinatari în checkoutul existent, inclusiv numai prieteni și cumpărare independentă de grup. Confirmarea unui extra este separată de protecția contra cumpărărilor concurente. Înregistrările gratuite folosesc emiterea/inventarul real, fără Stripe sau factură.
- Primire: oferta se acceptă în contul destinatarului; abia atunci proprietatea și credentialul se actualizează atomic. Acceptarea nu apasă „Vin”. QR-ul este deschis numai în viewerul privat existent; comanda și drepturile fiscale rămân cumpărătorului.
- Istoric: ieșirile se încheie după regula serverului, conversația rămâne. Rutele canonice sunt `/groups`, `/groups/:id` și `/groups/:id/outings/:planId`. Notificările deschid aceleași obiecte.

Datele afișate de produs provin din API. Persoanele/evenimentele fictive există numai în fixture-urile de test, fără mod demo introdus în aplicație. Actualizările conversației folosesc polling la cinci secunde cât ecranul este activ/vizibil, plus refresh după acțiuni; nu pretindem transport WebSocket nou sau livrare instantanee.

## Ce a fost eliminat

- UI-ul chatului automat per eveniment, crearea lui, butonul de ajutor al acelui chat și entry point-urile din eveniment, bilete, profil și notificări.
- Workerul care închidea/ștergea camera după eveniment și actualizările sale automate la editarea evenimentului.
- Scrierile vechi de plan/chat și notificările `safety_*`. Endpointurile de compatibilitate răspund controlat cu 410; linkurile vechi duc spre o destinație sigură, nu spre un grup privat arbitrar.
- Formularele de buget, întâlnire și stările de deplasare din noua experiență.

Planurile istorice autorizate rămân read-only. Nu am migrat automat persoane sau mesaje. Nu am șters nediferențiat date istorice. Biletele, comenzile, garderoba, programul și funcțiile operaționale rămân independente de conversație.

Navbarul și animația Search nu au fost redesenate pentru această implementare. Modificările de navbar/Search deja existente în worktree înainte de sarcină au fost păstrate. Banda de zile a primit doar limite opționale pentru reutilizare în planificare; Discover își păstrează valorile implicite.

## Verificări efective

| Verificare | Rezultat și limită |
|---|---|
| API Go | Rularea finală `go test ./... -count=1` a trecut pentru toate pachetele, cu `ISOLATION_TEST_DATABASE_URL` pe PostgreSQL local izolat: outings 16,745 s, payments 25,859 s. Suitele opt-in necesită propriile variabile de mediu; nu pretindem că toate integrările opționale au rulat doar prin această comandă. |
| Plăți și bilete | Suitele locale payments/outings și suita dedicată tickets au trecut, inclusiv 100 de scanări online concurente, snapshot offline, acceptare/rotire credential și izolarea comenzilor finalizate. Fără debitare Stripe reală. |
| Notificări | Teste PostgreSQL pentru coadă/push, membership, mute și retragerea vechilor notificări. Niciun push trimis pe telefon. |
| Logică comună | 146 teste au trecut, inclusiv retry idempotent, revocare/rejoin, răspunsuri întârziate, gap între pagini, draft, create+share atomic, merge de date actuale, cursor de istoric și citire reîncercată. |
| React Native | Toate cele 710 teste au trecut după corecțiile finale. `tsc --noEmit` cu TypeScript-ul aplicației a trecut. |
| Next.js | 136 teste locale au trecut; `tsc --noEmit` a trecut. |
| Browser React Native | Navigare reală pe serverul agent 8083: eveniment → grup nou → share atomic → ieșire cunoscută → răspuns → rezervare gratuită numai pentru prieten → a doua ieșire; acceptare ofertă, QR privat, ofertă blocată + bilet propriu, invitație pending, propuneri/date/istoric, draft și bandă de zile. API controlat prin fixture izolat. |
| Browser Next.js | Același parcurs, plus grup gol fără eveniment, retry de mesaj cu același ID, membru vs inițiator și păstrarea poziției mesajului vizibil când se încarcă pagina anterioară. API controlat prin fixture izolat. |
| Layout | Capturi și verificări la 320, 390 și 1024 px, fără overflow orizontal. Conversație lungă cu fereastră virtualizată; sute de mesaje nu sunt montate simultan. |
| Arhitectură | Verificarea importurilor și cele cinci teste ale regulilor de arhitectură au trecut. Excepția pentru geometria pură `figma-squircle` nu permite dependențe React/platformă în core. |
| Migrări locale | Up/Down/Up și backfill conservator verificate pe baze disposable. Rollbackul grupurilor ori al asocierilor de cumpărare populate cere arhivare explicită; nu șterge conversații sau mapări financiare în tăcere. |

Am inspectat efectiv capturile conversației, creării grupului, ieșirii confirmate, propunerilor, selectării serii și destinatarilor. Le-am comparat cu referințele Home/Discover locale: fundal negru, suprafețe închise calme, magenta și fotografia evenimentului. Capturile Next din preview au folosit font fallback când Google Fonts nu s-a descărcat; nu sunt probă de fidelitate tipografică finală pe telefon.

Scripturi reproductibile:

- `apps/spottr-native/tests/browser-permanent-groups.cjs` — implicit `http://localhost:8083`.
- `apps/pulse-app/scripts/groups.browser.cjs` — preview Next local pe 8084.
- `packages/app-core/tests/permanent-groups.test.ts`.
- Testele Go și variabilele lor sunt detaliate în rapoartele de backend și plăți de mai jos.

Capturile generate sunt în `apps/spottr-native/artifacts/groups-native-*.png` și `groups-next-*.png`. Logurile locale sunt `artifacts/permanent-groups-*.log` în aplicația native, `.next/groups-browser.log` în Next și `api/.tmp/permanent-groups-final-api-tests.log`. Aceste artefacte locale se regenerează din scripturi; nu sunt date de produs.

## Protecții și limite de lansare

1. Sunt necesare API-ul nou și migrările `20261105120000_outing_ticket_recipients.sql`, `20261114120000_permanent_friend_groups.sql`, `20261115130000_ticket_offline_exposure.sql`, aplicate în ordine într-un mediu autorizat. Nu am făcut deploy sau migrări pe serverul real.
2. Nu rula vechiul worker de ștergere a chatului lângă API-ul nou. Guardurile blochează scrierile vechi, dar un worker vechi separat care șterge date trebuie oprit la rollout. Rollbackul cu date existente necesită planul de arhivare documentat.
3. Un membru nou primește istoricul conversației numai de la acceptare. Un eveniment trimis atomic înaintea acceptării nu este dezvăluit retroactiv ca mesaj. Snapshotul curent al unei ieșiri active poate fi vizibil, fără discuția privată anterioară.
4. Un pachet offline deja descărcat nu primește automat bilete emise ulterior. Personalul actualizează pachetul sau validează online pentru acestea. Credentialele efectiv expuse offline nu se rotesc.
5. Nu există în repository un sistem general verificat de block/report. Am reutilizat permisiunile reale de prietenie și cont activ; nu am simulat astfel de API-uri.
6. Nu am verificat această versiune pe un iPhone/Android fizic: tastatură/composer, swipe-back, cameră, sticla nativă, performanța cadrelor, PaymentSheet și push credentials rămân verificări de device. Nici plățile 3DS ori webhooks Stripe reale nu sunt demonstrate de browserul cu fixture-uri.

Separat, eroarea locală Home/Discover de pe Expo web optimizat a fost reparată: bundle-ul Metro `dev=false` folosește proxy-ul local `/api/v1`, nu ocolește proxy-ul pentru că `__DEV__` este fals. Citirea efectivă a sesiunii 8081 a returnat șase evenimente cu HTTP 200. Sesiunile utilizatorului de pe 8081/8082 nu au fost oprite sau repornite.

Rapoarte independente:

- [Backend, acces și retragerea chatului](permanent-groups-backend-2026-11-15.md)
- [Plăți, atribuiri și scanare offline](permanent-groups-payment-review-2026-11-15.md)
