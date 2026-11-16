# Next.js — referința unică a evenimentului, 16 noiembrie 2026

Implementare peste grupurile permanente existente, în `apps/pulse-app`. Prototipul a fost folosit pentru comportament, nu drept temă vizuală. Navbar-ul și animația Search din Discover nu au fost modificate. Nu s-au făcut deploy, migrare sau operațiuni pe producție. Porturile utilizatorului 8081/8082 au rămas neatinse.

## Implementare

- `GroupEventReference` folosește numai asocierea explicită `message.outingId` / `referenceMessageId` și opțiunea evenimentului din ieșirea respectivă. Distribuirea neasociată rămâne independentă; nu există deduplicare globală după titlu, fotografie sau eveniment.
- Lista evenimentelor distribuite folosește helperul comun `groupSharedEventReferences`. Dacă sursa și un alias sunt prezente în pagină, păstrează sursa și autorul original, indiferent de ordinea răspunsului API. Ieșirile diferite și distribuirile neasociate rămân distincte.
- „Propose for outing” transmite `sourceMessageId`. Mesajul original evoluează în comparație sau invitație, păstrând ID-ul, autorul, ora și conținutul. Alegerea și răspunsurile ulterioare nu produc încă un poster activ. Actualizările de context sunt istoric compact, inclusiv când nu au propriul `referenceMessageId`.
- După răspuns, participarea apare ca un rezumat compact, cu modificare/retragere într-un sheet existent și acces la bilete. Retragerea folosește `answer: unanswered` și runda curentă. Un refuz al API-ului păstrează selecția confirmată și oferă retry local.
- Preferințele pentru opțiuni rămân independente. Alegerea destinației este explicită și aparține creatorului. După alegere, alternativele sunt reduse. Opțiunile indisponibile ori incompatibile cu data/orașul nu mai expun vot activ.
- În editor, o dată veche salvată nu mai este însoțită de o bandă care arată artificial ziua curentă. Utilizatorul vede valoarea veche și alege explicit o seară nouă; închiderea fără salvare nu o modifică.
- `CheckoutReservationRecovery` distinge rezervarea proprie pre-Pay de plata deja încercată. Verifică aceeași comandă prin `/checkout/recover`; nu creează o comandă și nu o înscrie drept tranzacție. Un checkout hosted valid se reia în același tab, la URL-ul aceleiași sesiuni Stripe. Un formular nativ de pe alt dispozitiv nu este convertit într-o plată web nouă.
- Închiderea checkoutului este disponibilă numai după un răspuns verificat `pending` / `paymentAttempted: false` și o confirmare separată. Un rezultat necunoscut sau o eroare păstrează rezervarea. Dacă plata câștigă cursa cu închiderea, se reîncarcă rezultatul confirmat; nu se cere refund și nu se reia automat cumpărarea.
- Recuperarea este disponibilă atât în footer-ul ieșirii, cât și după conflictul real al selecției de destinatari. Verificările existente privind proprietatea, biletele pentru prieteni și confirmarea unui bilet suplimentar rămân active.
- Accesul la un QR propriu deja valid este independent de reluarea checkoutului sau de verificarea plății pentru bilete suplimentare; butonul nu dispare în aceste situații.

## Verificări executate în această etapă

### Cod

- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: trecut după integrarea recovery, generarea contractului, utilizarea helperului comun pentru colecție și păstrarea QR-ului propriu în footer.
- `node --test scripts/*.test.cjs`: 136 teste trecute, zero eșecuri.
- `git diff --check` pe fișierele grupurilor, ieșirilor și scripturilor: fără erori de whitespace.

### Parcurs real local cu două identități

`scripts/groups-single-flow-real.browser.cjs` folosește Next pe 8084, handler-ele Go pe 8086 și PostgreSQL izolat pe 55436. Bootstrap-ul conturilor folosește identități de test; operațiunile de grup, mesaje, evenimente, participare, vot, înscriere gratuită și transfer sunt requesturi reale către API-ul local. Nu este un test al loginului JWT de producție.

1. Membrul acceptă grupul și distribuie evenimentul prin selectorul real.
2. Creatorul propune ieșirea din acel mesaj. Autorul membru, ora, ID-ul și conținutul original rămân identice; nu apare un poster ales duplicat și conversația nu este părăsită automat.
3. Al doilea cont răspunde „Nu vin”, retrage răspunsul și răspunde „Vin”; aceeași referință se actualizează.
4. Creatorul redeschide alegerea, adaugă încă un eveniment din selector, revine în chat, exprimă două preferințe independente și alege explicit destinația. Alternativa se compactează.
5. Alegerea destinației de către membru este refuzată de API (403).
6. Înscrierea gratuită pentru sine și prieten emite biletele în baza locală. Destinatarul nu primește acces la bilet înainte de acceptarea transferului.
7. Un al doilea bilet propriu cere confirmarea explicită „extra”.
8. Prietenul acceptă transferul și primește accesul propriu la bilet.
9. Schimbarea datei produce verificarea de impact 409 și salvarea explicită 200. Opțiunile incompatibile nu mai au vot activ. Redistribuirea aceluiași eveniment pentru altă ieșire păstrează o a doua referință explicită, fără deduplicare globală.

În prima execuție completă, pasul 9 a descoperit un card de comparație duplicat provenit dintr-un mesaj vechi de context. Proiecția a fost corectată, apoi pasul 9 a fost reluat pe aceleași date și a trecut. Pașii de cumpărare anteriori nu au fost repetați artificial. Dovezile și requesturile sunt păstrate în `.tmp/groups-single-flow-real.json`.

După repornirea fixture-ului cu noul endpoint, `groups-checkout-recovery-real.cjs` a verificat suplimentar handlerul HTTP/Go/PostgreSQL: o comandă gratuită finalizată întoarce `completed` atât la `check`, cât și la `cancel`, fără modificarea biletelor; alt cumpărător nu o poate verifica sau închide (404); alt eveniment și un ID necunoscut sunt refuzate (404); cererea fără autentificare este refuzată (401). Rezultatele sunt în `.tmp/groups-checkout-recovery-real.json`. Fixture-ul browser nu are provider Stripe, deci această verificare nu acoperă reluarea unei rezervări pre-Pay la Stripe.

### UI cu răspunsuri controlate

- `groups-single-flow.browser.cjs`: identitate originală, răspuns/retragere, eroare și retry fără pierderea selecției, distribuire independentă, preferințe multiple fără alegere implicită, opțiune incompatibilă fără vot și înlocuirea explicită a datei vechi. Colecția păstrează autorul canonic când sursa este înainte sau după alias, fără să elimine distribuirea independentă. Matricea a fost reluată după integrarea helperului comun. La viewport 320 px, cardul măsurat este 252 × 277,28 px, fără overflow.
- `groups-checkout-recovery.browser.cjs`: opt scenarii de siguranță — continuare pe dispozitivul original, lipsa anulării automate și confirmarea închiderii; accesul păstrat la QR-ul valid în timpul recuperării unui checkout extra; eroare de rețea și retry; context schimbat; plata confirmată în timpul închiderii; reconcilierea unei plăți începute; refuzul URL-ului nesigur și al altei comenzi; reluarea URL-ului hosted în același tab.

Ultimul test folosește răspunsuri sintetice de provider și interceptează navigarea către Stripe. Nu contactează Stripe și nu pretinde că a efectuat o plată reală.

## Capturi inspectate

Harness-ul comun salvează capturile în `apps/spottr-native/artifacts/`, deși aplicația verificată este Next pe 8084:

- `groups-single-flow-next-{01-unanswered,02-answered,04-comparing,06-narrow,07-past-context}.png`
- `groups-single-flow-real-{02-canonical-in-place,06-destination-and-alternative,07-self-friend-checkout,09-extra-safeguard,11-member-wallet-entry,12-incompatible-context,13-same-event-new-context}.png`
- `groups-single-flow-recovery-{native-confirm,context}.png`

Am inspectat vizual compozițiile principale de răspuns, comparație, alternativă, context incompatibil, referințe separate și confirmarea închiderii checkoutului. Capturile browserului local folosesc fallback-ul fontului deoarece descărcarea Google Fonts nu a fost disponibilă în mediu; nu sunt o dovadă a randării fontului pe iPhone.

## Limite

- Nu a fost testată aici o plată Stripe live, o debitare de card sau o factură fiscală. Înscrierea gratuită și transferul au fost reale doar în baza locală izolată.
- Testele browserului nu certifică animațiile, tastatura sau performanța pe iPhone fizic.
- Testele backend ale providerului/reconcilierii sunt raportate separat de agentul API; cele opt scenarii browser de recovery de mai sus sunt explicit sintetice. Endpointul real a fost verificat separat pentru o comandă gratuită finalizată și protecțiile de proprietate.
- Nu s-a schimbat politica de tranzacții: deschiderea checkoutului nu este prezentată ca plată, iar factura/biletul plătit rămân dependente de confirmarea serverului.
