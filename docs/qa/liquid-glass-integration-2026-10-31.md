# Integrare Liquid Glass — 31 octombrie 2026

## Scope și istoric

Reconciliere autorizată a branch-ului staging, nu redesign nou și nu audit global de securitate/accesibilitate. Incoming: origin/staging la 8a4c4c1. Commit local păstrat: 996d03c. Merge local: 26b62f2. Fixurile UI/focus restaurate din working tree rămân necomise; nu s-a făcut push/deploy, reset sau drop de stash.

Backup-uri păstrate:

- Branch backup/staging-before-liquid-glass-20261031 indică HEAD-ul original 996d03c.
- Stash original a7895cb4df7cf39a860b37490d3a15f385894e20 conține working tree și indexul original. Restabilirea indexului vechi cu --index nu s-a putut aplica atomic peste fișierele noi; conținutul a fost reaplicat în trei versiuni și reconciliat manual.
- Stash-ul suplimentar „spottr tracked-only pre-pull safety 2026-10-31” este păstrat. Nu reaplica automat stash-urile peste versiunea deja reconciliată.

Au fost rezolvate patru conflicte între commit-uri, apoi 24 de conflicte la reaplicarea lucrului local. Îmbinarea automată a fost verificată și pentru conflicte semantice, nu numai pentru delimitatori Git.

## Principii și corecții

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH, rezolvat | apps/spottr-native/src/screens/DiscoveryScreen.tsx | Îmbinarea automată excludea city din starea panoului, deși noul toolbar îl deschidea | Tip, titlu, dropdown și reset selectiv city complete | Butonul de oraș nu trebuie să deschidă un panou gol |
| HIGH, rezolvat | apps/spottr-native/src/map/MapEventsCarousel.tsx | Import vechi usePreferences și ref View incompatibile cu noul SDK | Hook-ul separat și ViewInstance din incoming | Evită eroarea la deschiderea hărții și păstrează tipurile noului React Native |
| MEDIUM, rezolvat | apps/spottr-native/src/ui/ActionButton.tsx; apps/spottr-native/src/screens/EventScreen.tsx | WIP folosea MotionPressable direct, incoming folosea AccentPressable și grupuri Glass | Componenta comună compune AccentPressable; grupul Glass al CTA-ului rămâne | Păstrează materialul nativ împreună cu semantica, busy/disabled și textul alb |
| MEDIUM, rezolvat | apps/spottr-native/src/ui/MotionPressable.tsx; apps/spottr-native/src/screens/DiscoveryToolbar.tsx; apps/spottr-native/src/ui/FormInput.tsx | Fixurile generice puteau reseta motion-ul și desena focus în inputul animat | Calibrarea incoming păstrată, reduced motion și focusOwner explicit, icon de filtre centrat în fallback | Căutarea și materialul nou rămân referința vizuală, fără focus interior duplicat |

Păstrate: navigația persistentă și capsulele noi; primitivele Glass iOS/Swift incoming; calendar fără selector single/range; carusel ascuns/afișat și selecție/focus hartă; controale de zoom Glass; filtrele și revenirea la pagini; recuperarea plății, limitarea click-urilor și stările accesibile; focusul în accent și fallback-ul contrastant Web.

Verificarea CSS tokens acceptă CRLF echivalent pe Windows, dar continuă să respingă diferențele de valori. Cache-ul pnpm este ignorat în Git; nu se comit datele temporare ale package managerului. Dependențele au fost instalate din lockfile înghețat, fără scripturi de instalare.

## Verification

- Next build și Native export:web: PASS.
- Native typecheck cu TypeScript 6.0.3 al aplicației: PASS. Compilerul TypeScript 5.9 al workspace-ului nu este substitutul compilerului Native după actualizarea SDK-ului.
- 634 teste Native și 64 teste Web: PASS.
- Native web: discovery, search motion/reversări/reduced motion, navbar organizator/admin/user, hartă/carousel/zoom, garderobă și checkout cu API/plată simulate: PASS.
- Next: biblioteca UI/AX/focus/forced-colors, autentificare focus și discovery: PASS.
- go test ./internal/interactions: PASS; fără acces la baza live.
- Capturi inspectate: switch Discovery, checkout summary, garderobă mobilă. Componentele/materialele iOS și navigația incoming nu au fost înlocuite de fallback-uri în sursă.
- Fără delimitatori de conflict, whitespace errors sau conflicte Git rămase.

Not verified: Xcode/iOS/Android fizic, VoiceOver/TalkBack, Safari/Firefox și calitatea materialului Liquid Glass pe hardware. Actualizarea Expo/React Native și a modulului Swift cere rebuild al aplicației native/dev client pe Mac, nu numai refresh Metro. Acest raport nu închide constatările globale HIGH din auditul anterior.

## Review

Gate 1 (merge între commit-uri): ACCEPT, 9,2/10, reviewer independent.

Gate 2 (WIP reaplicat și componente comune integrate cu Glass): ACCEPT, 9,2/10, reviewer independent. Nu au rămas findings Critical/High/Medium în această reconciliere. Limitările hardware/screen reader de mai sus rămân declarate; scorul nu modifică verdictul global al auditului UI anterior.
