# Garderoba SPOTTR

## Activare și utilizare

Aplicați migrările `20261019120000_wardrobe.sql` și `20261019130000_wardrobe_retention.sql`, publicați API-ul și Next.js și
distribuiți buildul React Native actualizat. Nu sunt necesare chei noi sau Stripe.
Garderoba este un serviciu fără plată în aplicație în această versiune.

Organizatorul deschide **Dashboard → Garderobă → Personal garderobă → Configurare**,
alege evenimentul și creează zone. O zonă are nume, prefix (1–8 litere A–Z), tip de obiecte și între
1 și 2.000 de locuri (maximum 20 de zone/eveniment). Locurile fizice se etichetează
identic: A001, A002 etc. Prefixul, tipul și capacitatea sunt fixe după creare;
pentru extindere se creează o zonă nouă. O zonă oprită nu acceptă depozitări noi,
dar permite ridicarea obiectelor existente.

Conturile existente sunt desemnate prin email, separat de echipa de validare a
biletelor. Operatorii pot depozita/muta/preda; responsabilii pot și recupera
asistat. Doar organizatorul evenimentului configurează zonele și echipa.
Accesul este verificat la fiecare cerere, inclusiv după revocare.

Operatorul selectează zona și obiectele, apoi scanează QR-ul contului. Serverul
atribuie cel mai mic număr liber. Locul este rezervat 5 minute; operatorul pune
obiectele în locul indicat și apasă **Depozitat**. O scanare repetată deschide
depozitarea existentă; **Adaugă alte obiecte** creează explicit o nouă depozitare.
Un client poate avea mai multe locuri și poate ridica doar o parte din obiecte.

În **Garderobă → Neridicate**, echipa vede obiectele încă depozitate după ora de
încheiere a evenimentului selectat. Lista începe cu cele mai vechi depozitări și
arată clientul, numărul, zona, obiectele rămase, data și timpul trecut de la
depozitare. Căutarea după nume/număr și paginarea păstrează această ordine;
rezumatul numără toate depozitările și obiectele rămase la eveniment, chiar și
când lista este filtrată. Sunt incluse ridicările parțiale, nu rezervările
neconfirmate. Predarea și recuperarea asistată folosesc aceleași permisiuni și
confirmări ca în Depozitări. Înainte de finalul evenimentului, secțiunea explică
de ce lista este încă goală.

Clientul are card în Home și profil și ecranul `/wardrobe`, cu QR-ul contului și
depozitările active. Personalul cere ridicarea pentru obiectele selectate;
clientul confirmă din propriul cont, iar personalul confirmă predarea fizică.
Confirmarea expiră în 3 minute și se invalidează la mutarea locului sau schimbarea
cererii. QR-ul social static identifică persoana, dar nu autorizează ridicarea.
Nu este necesară permisiunea pentru notificări push: ecranul se actualizează
periodic cât este deschis și activ (5 secunde, cardurile la 20 secunde).

Telefonul descărcat se rezolvă prin **Recuperare asistată**: responsabilul
verifică dreptul de ridicare conform procedurii locației, descrie verificarea
(fără date din acte) și confirmă obiectele predate. Această excepție rămâne în
istoric. Selectarea unui nume/număr nu constituie singură dovada dreptului.

## Consistență și limite

Operațiunile au nevoie de conexiune la server. Nu se acceptă predări offline cu
sincronizare ulterioară: două ghișee izolate nu pot cunoaște aceeași evidență.
Interfața nu afișează succes înainte de confirmarea API. După o eroare de rețea,
personalul actualizează înregistrarea înainte să repete o operațiune.

Tranzacțiile blochează rândul evenimentului înaintea depozitării. Un index unic
permite o singură depozitare activă pe loc. Rezervările au o cheie de idempotență
și un hash al parametrilor; schimbarea parametrilor cu aceeași cheie este respinsă.
Mutațiile au revizie obligatorie pentru a împiedica predarea dintr-un ecran vechi.
Starea și auditul se salvează în aceeași tranzacție. Istoricul folosește paginare.

Evenimentele încheiate/anulate nu acceptă depozitări noi; obiectele existente
rămân accesibile până la predare. Evenimentele cu orice depozitare în istoric sunt
protejate împotriva ștergerii fizice; API-ul explică acest lucru printr-un răspuns 409.
Un eveniment cu doar configurare de garderobă, fără depozitări, poate fi șters
în condițiile obișnuite. Ștergerea contului unui
client elimină asocierea la cont, dar nu eliberează fizic locul: responsabilul
poate închide depozitarea prin recuperare asistată. Datele de audit sunt accesibile
numai echipei evenimentului. Nu există ștergere automată a obiectelor neridicate.

## Curățare automată

API-ul curăță garderoba la pornire și apoi o dată pe oră, în loturi de maximum
100 de evenimente. Termenul este de 7 × 24 de ore după `events.end_time`.
Depozitările predate/anulate și auditul asociat se șterg definitiv din baza activă.
O predare târzie se păstrează încă 7 zile după `returned_at`; pentru rezervări
anulate/expirate se ia în calcul și `reserved_until`. Rezervările abandonate nu
sunt confundate cu obiectele efectiv depozitate.

Obiectele încă nerevendicate, inclusiv ridicările parțiale, nu se șterg. Locurile,
echipa și istoricul lor rămân disponibile. Configurarea, locurile și accesul
personalului se elimină numai după expirarea ultimei depozitări. Evenimentul,
conturile, biletele, plățile și facturile nu sunt șterse de acest proces.
Reprogramarea evenimentului mută și termenul de retenție. După termen, un
eveniment fără depozitări nu mai acceptă o configurare nouă care ar dispărea
la următoarea curățare.

Ștergerea face loc pentru reutilizare în PostgreSQL; nu micșorează automat
discul provisionat și nu modifică politica de păstrare a backupurilor.

## Verificări

- Go: autorizare, alocare concurentă, idempotență, capacitate, expirare, revocare,
  confirmare proprie, ridicare parțială, reluări și recuperare asistată.
- Client comun: QR, selecție, răspunsuri întârziate și reluare după pierderea răspunsului.
- TypeScript Next.js/Native și browser pentru configurare, depunere și predare.
- Înainte de folosire reală: test pe două telefoane la aceeași garderobă, cameră,
  Wi-Fi întrerupt, background/foreground și gestul nativ de întoarcere.
