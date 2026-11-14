# Expo Go iPhone XS: Failed to load all assets

Dispozitiv raportat: iPhone XS, iOS 17 (antetul cererii: 17.6.1), Expo Go 58.0.5, instalare proaspătă, telefon resetat cu spațiu liber. PC 192.168.1.2; telefon 192.168.1.6. Safari nu a ajuns la serverul LAN, dar a putut descărca statusul prin tunel HTTPS.

## Cauză reprodusă

Inspectorul local ngrok arată cererea bundle Expo Go cu răspuns 500. Tunelul transmite două valori identice `X-Forwarded-Proto: https, https`. Metro 0.87.1 construiește baza URL cu valoarea întreagă, generând un URL invalid înainte de încărcarea aplicației. Cererea fără antetele forwarded funcționează.

Nu este o eroare de spațiu liber și nu este demonstrată o incompatibilitate a aplicației cu iOS 17.

## Corecție și probe

`apps/spottr-native/scripts/metro-proxy-headers.cjs`, conectat în `metro.config.js`, normalizează valorile HTTP(S) duplicate și identice înainte de middleware-ul Metro. Antetele contradictorii/malformate primesc 400. Hostul, calea, query-ul și autentificarea nu sunt schimbate. Fixul se aplică numai serverului Metro, fără editarea node_modules sau a aplicației instalate.

- Reprodusă aceeași cerere capturată, cu antetele tehnice de proxy, către serverul agentului 8083 înainte de fix: HTTP 500, text/html, 148 bytes.
- După repornirea numai a serverului agentului 8083: HTTP 200, application/javascript, 15.791.822 bytes descărcați integral.
- Test HTTP local pentru bundle/asset, protocol unic/duplicat, fără proxy și refuzul antetelor invalide: trecut.
- Nu au fost salvate/exportate antetele de sesiune Expo sau alte credențiale din inspector. Scriptul temporar de replay copiază numai Host și antetele forwarded, în memorie, către loopback.

## Repornire și confirmare

Serverul utilizatorului de pe 8081 nu a fost repornit de agent. Configurația Metro se citește la pornire. Utilizatorul a confirmat „merge gata” după solicitarea de Ctrl+C în acel terminal și:

```powershell
pnpm.cmd --filter @apps/spottr-native run start:go --port 8081 --no-dev --minify
```

După repornire, inspectorul tunelului arată cererile reale bundle ale XS-ului (`Exponent/58.0.5`, `iPhone11,2`, iOS 17.6.1) cu răspuns 200, inclusiv varianta care eșua înainte. Linkul actual a fost recitit din `/_expo/open` și QR-ul direct regenerat în artefacte. Descărcarea este confirmată pe traficul dispozitivului; agentul nu a inspectat personal interfața XS sau parcursul nou al planurilor pe telefon.
