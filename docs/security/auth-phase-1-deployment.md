# SPOTTR — securitate autentificare, etapa 1

## Ce acoperă patch-ul

- `forgot-password` nu mai returnează tokenul. Conturile existente, inexistente și erorile de persistență primesc același răspuns public. Nu este o garanție de timp de răspuns identic; protecția anti-abuz/rate limiting rămâne separată.
- Ruta legacy `POST /api/v1/users[/]` și handlerul cu mass assignment sunt eliminate. Înregistrarea normală continuă să atribuie exclusiv rolurile publice; câmpurile administrative din JSON nu sunt folosite.
- Emiterea și consumarea linkurilor de resetare folosesc același lock pe utilizator. La resetare, tokenul este revalidat după lock, parola este actualizată și toate linkurile de resetare ale utilizatorului sunt șterse atomic. Linkurile de activare nu sunt șterse.
- API-ul refuză pornirea cu `JWT_SECRET` gol, sub 32 bytes, cu whitespace sau placeholder-uri uzuale. Toate sesiunile utilizator/scanner folosesc aceiași bytes; acceptăm doar HS256, expirare obligatorie și verificarea `iat` dacă există.
- Emailul de resetare folosește un context independent de request. Contextul are deadline, dar transportul SMTP existent nu întrerupe încă apelul `smtp.SendMail` la expirarea lui; timeout-ul de rețea/outbox-ul și limitarea cererilor sunt lucrări ulterioare.

Nu sunt schimbări de schemă: **nu trebuie rulat un task de migrare pentru codul acestui patch**. Curățarea tokenurilor deja expuse este o operațiune de securitate separată, descrisă mai jos.

## Înainte de deployment

1. Pregătește o fereastră de mentenanță pentru autentificare. Nu opri livrarea webhookurilor Stripe ca efect secundar. Nu șterge comenzi, bilete, facturi sau date de plată.
2. Verifică sursa variabilei `JWT_SECRET` în task definition și referința sa din Secrets Manager, fără a copia valoarea în loguri/chat/repository. Generează o cheie nouă din minimum 32 bytes aleatori criptografic (de exemplu, 32 bytes reprezentați prin 64 caractere hex). Validarea lungimii nu poate demonstra că o cheie este aleatoare. Nu folosi cheile fixe din teste.
3. Pregătește noua revizie de API cu cheia nouă și aceleași variabile necesare aplicației. Verifică într-un mediu de test login, Google login, resetare, activare și sesiune scanner. Cheia nouă nu invalidează datele Stripe sau cheia de criptare pentru facturare; acestea sunt configurații separate.
4. Păstrează dovezile și verifică administratorii existenți și conturile create pe ruta legacy. Verifică parolele/bootstrap credentials deja cunoscute și rotește-le printr-un flux sigur. Eliminarea rutei nu șterge un admin creat anterior și nu schimbă o parolă deja compromisă. Dacă există indicii de exploatare, tratează situația ca incident, nu doar ca deployment.

## Ordinea operațiunilor în producție

Operațiunile de mai jos nu au fost executate de acest patch; necesită accesul și aprobarea operatorului.

1. Restricționează temporar accesul public la autentificare/reset și la ruta legacy vulnerabilă. Coordonează și sesiunile active de scanare: rotația cheii le invalidează.
2. Publică API-ul remediat cu noul `JWT_SECRET`, apoi verifică healthcheck-urile și retragerea **tuturor** taskurilor/reviziilor vechi, inclusiv orice instanță alternativă care servește autentificarea. Nu redeschide traficul într-un rollout mixt: tokenurile noii chei nu funcționează pe vechea cheie, iar vechea versiune încă expune vulnerabilitățile.
3. **După retragerea instanțelor vulnerabile**, invalidează linkurile de resetare existente. O curățare făcută numai înainte de rollout nu este suficientă: vechiul cod putea emite și scurge alte linkuri între timp.
4. Verifică faptul că un JWT vechi este respins, un link de resetare vechi este respins, `POST /api/v1/users/` nu este disponibil, iar un nou link primit prin email funcționează exact o dată. Verifică și resetarea cu un al doilea link mai vechi: acesta trebuie respins după primul reset reușit.
5. Redeschide autentificarea. Utilizatorii trebuie să se autentifice din nou; sesiunile temporare de scanner trebuie regenerate. Monitorizează erorile de startup, autentificare și livrare email fără a loga tokenuri.

### Curățarea tokenurilor expuse — doar de către operator

Într-o sesiune administrativă conectată explicit la baza corectă, verifică mai întâi ținta și numărul de linkuri:

```sql
SELECT current_database(), current_user;
SELECT count(*) FROM user_tokens WHERE type = 'password_reset';
```

După confirmarea țintei și a retragerii versiunilor vulnerabile:

```sql
BEGIN;
DELETE FROM user_tokens WHERE type = 'password_reset';
COMMIT;
```

Această ștergere invalidează intenționat toate linkurile de resetare existente. Nu restaura aceste tokenuri din backup. Utilizatorii pot cere linkuri noi după redeschidere. Nu modifică parole, linkuri de activare, bilete sau facturi. Nu executa automat acest SQL la fiecare startup.

### Rollback

Nu reveni la vechea imagine vulnerabilă și nu restaura cheia JWT compromisă. Dacă apare o incompatibilitate, păstrează rutele sensibile restricționate și corectează noua revizie. Rotația și curățarea tokenurilor nu trebuie anulate. Nu este necesar rollback de schemă.

## Testare reproductibilă

Din `api/`:

```powershell
go test ./...
go vet ./...
```

Testele PostgreSQL sunt opt-in și nu citesc configurația bazei aplicației. Pregătește o instanță **temporară**, accesibilă numai local, și o bază goală numită `spottr_security_test`. Setează `AUTH_TEST_DATABASE_URL` doar în procesul de test. Nu folosi credențiale sau baze din producție. Fiecare test își creează și șterge propria schemă `auth_test_*`.

Exemplu pentru instanța de test locală, fără parolă doar dacă izolarea locală este adecvată:

```powershell
$env:AUTH_TEST_DATABASE_URL = 'postgres://spottr_test@127.0.0.1:55439/spottr_security_test?sslmode=disable'
go test ./internal/auth ./internal/router ./cmd -count=1 -v
go test ./internal/auth -run TestSecurityConcurrentResetSingleWinner -count=10
Remove-Item Env:AUTH_TEST_DATABASE_URL
```

Fără această variabilă, testele de integrare sunt marcate SKIP, nu verificate. Nu interpreta un `go test` fără DB ca dovadă de atomicitate.

Acoperire: răspuns fără token; email independent de anularea requestului; înregistrare fără mass assignment; rută legacy absentă pentru user/organizer/admin; JWT nesigur/expirat/fără expirare/algoritm greșit/scop greșit; startup fail-closed; consum unic; invalidarea linkurilor-surori; rollback la eroare; concurență pentru același token și tokenuri diferite; expirare în timpul așteptării lock-ului; sincronizarea emiterii cu resetarea.

## Limite și următorul pachet

Acest patch nu reprezintă închiderea întregului audit. JWT-urile deja emise nu sunt revocate automat la fiecare resetare de parolă; la acest deployment sunt invalidate prin rotația globală. Revocarea per utilizator, rate limiting, MFA admin, izolarea organizatorilor, verificările refundurilor, credențialele bootstrap/DB și actualizările de dependențe rămân în plan. O notă de acceptare pentru acest pachet nu este o nouă notă de securitate pentru întreaga aplicație.
