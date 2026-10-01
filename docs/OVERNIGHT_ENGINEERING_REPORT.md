# Overnight Engineering Report

Running ledger for the unattended release-readiness shift. Times are UTC.

## 2026-09-29 20:30 UTC — Baseline inspection

- `git status --short`: workspace contains staged, unstaged, and untracked work (including app source, assets, docs, Supabase, and many device screenshots). Preserved; no reset/clean operations used.
- `git diff --stat`: 9 unstaged paths, 112 insertions / 12 deletions; app config, package, TypeScript config, ignore file, and image assets are modified.
- `git diff --cached --stat`: 16 staged paths, 190 insertions; includes initial app/config files and image assets.
- `supabase --version`: 2.115.0. `supabase status`: blocked because Docker Desktop Linux engine pipe is unavailable. CLI reports a linked project named TapForm; its environment is not established, so no remote writes are authorized or attempted.
- ADB: Samsung SM-M356B is connected as `RZCX925WV0N`.
- Expo dependency: `~57.0.26`. No existing overnight report was present.

## Work log

Further phases append timestamped commands, findings, fixes, and verification results below.

## 2026-09-29 20:38 UTC — Baseline verification and backend environment

- `npm test`: 5 files / 29 tests passed.
- `npm run typecheck`: passed. `npm run lint`: passed.
- `npx expo install --check`: dependencies up to date. `npx expo-doctor`: 21/21 checks passed.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.
- `:tapform-nfc-peer:testDebugUnitTest :app:assembleDebug`: passed.
- `supabase migration list --linked`: remote has migrations `202609280001`–`202609280004`; feature migrations `202609290001` and `202609300001` are pending remotely. The linked project is named “TapForm” without a staging/development designation. No remote mutation attempted.
- `supabase status`: local database unavailable because Docker Desktop's Linux engine pipe is missing.
- Expo SDK 57 reference and `llms.txt` were consulted. Expo documents `:app:assembleRelease` / `npx expo run:android --variant release` as producing a production-mode bundle; the local release signing config is not Play Store signing.

## 2026-09-29 20:45 UTC — Standalone M35 launch

- `:app:assembleRelease`: passed in 11m12s. Metro's `createBundleReleaseJsAndAssets` task bundled 3,976 modules into `android/app/build/generated/assets/react/release/index.android.bundle`.
- Produced `android/app/build/outputs/apk/release/app-release.apk` (132,066,432 bytes). It is signed with the local Android debug key, contains placeholder Supabase configuration, and is strictly a device QA artifact.
- Verified no host Metro listener on ports 8081–8083. Installed the APK to SM-M356B with `adb install -r`: `Success`.
- Force-stopped/launched the package; `pidof` returned a live process and Android reported `com.tapform.app/.MainActivity` resumed. UIAutomator exposed the actual React Native sign-in labels and controls; screenshot saved at `.expo/qa-standalone-launch.png`. No fatal exception/JS error matched the post-launch logcat scan.
- Device exposes NFC/HCE and `dumpsys nfc` reports NFC state on; existing package manifest registers `TapFormApduService` with `BIND_NFC_SERVICE`. Physical NFC exchange is not yet tested.

## 2026-09-29 21:32 UTC — Navigation, consent, and final release verification

- Signed-out deep-link audit found that a protected tab could render directly. A first nested `<Redirect>` guard crashed on the M35 with `Maximum update depth exceeded`; a `router.replace('/')` follow-up hit the duplicate `/` route between the sign-in screen and Tabs home. Added a unique `/sign-in` route, a root access guard, and safe signed-out transport allowlisting. Request/share/incoming links now preserve their `returnTo` context while opening `/sign-in`.
- Added `src/domain/authRoutes.test.ts`. Final `npm test`: 6 files / 32 tests passed; TypeScript and lint passed.
- Rebuilt, installed, and re-tested the final standalone release APK on Samsung SM-M356B with no Metro listener. Direct `/profile` and `/tap-cards` intents now render sign-in; a valid-format request link reaches sign-in; `/privacy` and `/scan` remain reachable. Scanner showed request-reference-only copy. NFC Reader Mode displayed “Ready to tap”; process remained live and the cleared post-test crash buffer had no exceptions. This is single-device software/UI verification, not a completed peer exchange.
- An earlier synthetic QR was presented to the camera, but no QR result was observed. QR scanning is not physically verified. Only one NFC-capable phone is connected, so two-phone HCE/Reader exchange remains untested.
- Static SQL review found nullable consent booleans fail open in PL/pgSQL (`IF NOT NULL` does not enter the decline branch). Added `202609300002_require_explicit_consent.sql` to reject NULL in peer and organization consent RPCs, and added two pgTAP regressions. Plans match assertion counts: RLS 59/59 and exchange 28/28. These SQL tests have not executed.
- `npx supabase test db`: blocked by `ECONNREFUSED 127.0.0.1:54322`; no PostgreSQL server, Docker engine, or WSL PostgreSQL is available. `supabase migration list --linked` is read-only and shows `202609290001`, `202609300001`, and `202609300002` pending. The linked project is not identified as staging/development, so no remote migration or test writes were attempted.
- Added `stopActiveReader()` before starting the Organization NFC reader, so repeated entry disables any previous Reader Mode first. Native tests pass: 11 tests across `NfcProtocolTest` and `NotificationSelectionTest`.
- Final `:tapform-nfc-peer:testDebugUnitTest :app:assembleDebug :app:assembleRelease :app:bundleRelease`: passed. `npm run typecheck`, `npm run lint`, `npm test`, `npx expo install --check`, `npx expo-doctor` (21/21), and `npm audit --audit-level=moderate` (0 vulnerabilities) passed.
- Final artifacts: debug APK 336,194,415 bytes; release APK 132,067,796 bytes; AAB 85,826,493 bytes. APK signer is `CN=Android Debug`; `jarsigner` verifies the AAB but warns that its signer is self-signed. These are build/QA artifacts, not publisher-signed artifacts. Release bundle contains `base/assets/index.android.bundle` and the placeholder Supabase configuration used for QA.
- `.env` remains ignored. A path-only secret scan found service-role references only in Supabase function/migration files; no client source path matched. No secret values were printed or embedded in QA builds.

## Current blockers

- Database runtime: Docker/localhost PostgreSQL unavailable; linked remote environment is not safely identifiable as staging. Migrations and RLS suites remain runtime-unverified.
- Product flows behind authentication: no disposable backend/test-user runtime was available, so authenticated Personal/Organization screens and backend end-to-end flows were not physically exercised.
- Physical QR scan: no code was recognized on the M35 during the attempted alternate-display scan.
- Physical NFC: only one compatible phone was available; no two-phone exchange was performed.
- Publication signing: generated Android release artifacts use the debug key. Owner production signing credentials are not present and no private key/password was created or committed.
- A previously printed public Supabase anon key must be rotated by the owner before publication, per the prior session security finding. QA builds used placeholder values and did not read `.env`.

## 2026-09-29 21:34 UTC — Final artifact smoke check

- Reinstalled the final APK built with the NFC Reader Mode cleanup. `tapform:///profile` and `tapform:///tap-cards` opened sign-in; `tapform:///scan` opened the scanner. Selecting NFC displayed “Ready to tap”; `dumpsys nfc` reported `mState=on`, and package inspection showed `TapFormApduService` registered with `BIND_NFC_SERVICE`.
- `pidof com.tapform.app` stayed live through route checks. The crash buffer was cleared before the checks and contained no new fatal/JS exceptions. Final sign-in screenshot: `.expo/qa-final-signin.png` (local ignored QA artifact).
- `:app:assembleDebug`, `:app:assembleRelease`, `:app:bundleRelease`, and 11 Kotlin tests all passed in the final combined Gradle run. APK and AAB signatures were inspected: both artifacts use the Android debug/self-signed certificate, so neither is a publisher-signed release.
- No production database mutation, account operation, or credential-based sign-in was performed.

## 2026-09-30 — Signup failure repair

- Reproduced the likely cause from the previously installed QA artifact: the release APK had been built with `offline.tapform.invalid` and a placeholder publishable key, so Auth requests could not reach Supabase. The source `.env` has a configured project endpoint and publishable key; their values are not recorded here.
- Updated `src/app/index.tsx` to trim email input, handle thrown auth/network failures, and always clear the submit busy state. Added safe user-facing messages for unreachable Auth, existing email, signup-disabled, and rate-limit errors; unknown server details remain hidden.
- Added `src/domain/authErrors.ts` and tests covering service connectivity errors, duplicate accounts, rate limits, disabled signups, and redaction of unknown backend details.
- `npm.cmd test`: 7 files / 36 tests passed. `npm.cmd run typecheck` and `npm run lint`: passed.
- `NODE_ENV=production`, `EXPO_PUBLIC_DEMO_MODE=false`, `:app:assembleRelease`: successful in 2m17s. Bundle inspection confirmed it contains the configured endpoint/key, contains no offline QA URL, and does not enable demo mode.
- Installed updated `android/app/build/outputs/apk/release/app-release.apk` on connected Samsung SM-M356B. Force-stop/relaunch succeeded and UIAutomator showed the app's Organization tab surface. Existing on-device session was preserved.
- Read-only `GET /auth/v1/settings` using the configured publishable key returned successfully with signup enabled. No account was created and no account credentials were entered; end-to-end registration remains untested with a real user flow.
- Release APK remains debug-signed; it is for device verification only.

## 2026-09-30 — M35 startup splash hang

- Captured `.expo/tapform-loading-now.png` and a second screenshot after 12 seconds. Native splash remained visible, while UIAutomator exposed the Organization tab tree underneath; startup JS had rendered and no TapForm fatal/JS exception was present.
- Root cause: the signed-in tab group and entry route both normalize to `/`, so the root splash effect waited forever for a pathname change even after the tab group mounted.
- Consulted the Expo SDK 57 Router and SplashScreen docs. Root navigation now uses `useSegments()` to identify the entry route separately from `/(tabs)`, and hides splash after auth is ready and redirects are safe. Added a pure splash gate helper with regression tests for restored sessions, signed-out redirects, and the tab-group root alias.
- Final checks: `npm.cmd test` 8 files / 40 tests passed; `npm.cmd run typecheck` passed; `npm run lint` passed; `:app:assembleRelease` passed in 1m04s.
- Reinstalled release APK on SM-M356B. Two force-stop/cold-launch checks exposed the Organization home with Home/Templates visible after 8 seconds and 5 seconds respectively; screenshots/UI hierarchy confirm splash is gone. Existing session/data remained intact.
