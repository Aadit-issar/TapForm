# TapForm release checklist

Use this checklist against the exact release commit and production Supabase project. A successful JavaScript check does not replace a database, native, physical-device, or signed-artifact check.

## Code and backend

- [ ] Run `npm run typecheck`, `npm run lint`, and `npm test` on the release commit; retain CI output.
- [ ] Run `npx expo-doctor` and verify SDK-compatible dependencies.
- [ ] Apply and review every Supabase migration against a production-like database; verify migration order and existing-data preservation.
- [ ] Run the pgTAP suite at `supabase/tests/rls.test.sql` and add/execute authenticated cross-user and cross-organization behavior tests against seeded accounts.
- [ ] Verify User A cannot read User B's Vault or Tap Cards, organizations cannot query a user's Vault, organizations cannot read another organization's submissions, and users cannot read unrelated submissions or received cards.
- [ ] Verify RLS and RPC behavior for request/template ownership, response immutability, one-time questions, export, deletion, and peer transfers.
- [ ] Confirm `tapform-expiry-and-retention` exists in `cron.job`, runs successfully, expires pending sessions and exchange reservations, and removes request field values and answer content after retention.
- [ ] Exercise approval, decline, missing required data, optional exclusion, save-to-Vault consent, expiry during completion, revocation, replay, retry, duplicate submission, persistent links, and one-time links.
- [ ] Confirm no service-role key, account password, auth token, Vault value, answer payload, or personal submission payload is committed or logged.
- [ ] Verify the production environment points only to the intended Supabase project; confirm the client contains only the public URL and anon/publishable key.
- [ ] Configure the EAS `production` environment with the intended Supabase URL and a rotated public anon/publishable key; keep `EXPO_PUBLIC_DEMO_MODE=false`.
- [ ] Verify sign-up, email confirmation, sign-in, session refresh, sign-out, account deletion, and sign-in restoration from a clean install.

## Android, NFC, and QR

- [ ] Generate and inspect the merged release manifest; retain only required NFC, camera, Contacts, and notification behavior.
- [ ] Confirm application ID, version name, Android version code, SDK levels, app links, intent filters, notification channel, icon, adaptive icon, and splash.
- [ ] Test install, launch, onboarding, sign-in, permissions, font scaling, screen reader order, and error/empty states on physical Android devices.
- [ ] Test QR permission rationale/denial, valid and malformed codes, temporary/one-time expiry, persistent organization QR independence, deep-link sign-in return, and retry after interruption.
- [ ] Test Android NFC Reader/HCE with at least two NFC-capable devices, including foreground/background transitions, valid delivery, replay, expiry, cancellation, Secure NFC, notification denial, and process recreation.
- [ ] Test haptic feedback on the Samsung Galaxy M35 5G (SM-M356B) and another supported device.
- [ ] Confirm every transport sends only an opaque request/exchange reference; inspect the actual NFC APDU and QR/link payloads.

## Builds and signing

- [ ] Run Android debug build and install it on a device.
- [ ] Run Android release build and inspect the signed APK/AAB package and permissions.
- [ ] Build an Android App Bundle (`.aab`) with the production profile.
- [ ] Confirm the release artifact is signed with publisher-controlled production credentials, never the Android debug key.
- [ ] Keep keystore and passwords out of the repository and CI logs; document owner-controlled recovery and rotation.
- [ ] Run internal-track install/update, deep link, notification, QR, and NFC smoke tests on the actual signed artifact.

## Privacy and Play Console

- [ ] Complete the publisher, contact, effective-date, hosting-region, subprocessor, and public-URL details in `PRIVACY_POLICY_DRAFT.md`; obtain legal review and publish it.
- [ ] Confirm production deletion and export behavior, scheduled retention job, database backup retention, and any legally required exceptions.
- [ ] Complete Play Console Data Safety, content rating, audience, age, permission, and account-deletion disclosures from `PLAY_STORE_DATA_SAFETY.md` and the release SDK inventory.
- [ ] Publish a public account-deletion route if the applicable Play policy requires one.
- [ ] Complete `PLAY_STORE_LISTING_DRAFT.md` and capture current production screenshots and feature graphic.
- [ ] Do not claim verified organizations, government credentials, certification, regulatory compliance, or physically validated NFC support without evidence.

## Current verification record

- Supersedes the earlier verification entries in this document. On 2026-09-30, `npm test` passes 54 tests across 12 files; `npm run typecheck` and `npm run lint` pass; `npx expo install --check` reports dependencies up to date; `npx expo-doctor` passes 21/21; `npm audit` reports 0 vulnerabilities.
- The explicitly disposable Supabase project **TapForm Staging** (`yngyfamebdvqilhiuart`) has all 11 local migrations applied in order and 11/11 remote migration records synchronized. The hosted `supabase/tests/rls.test.sql` suite passes 64 assertions and `supabase/tests/exchange_access.test.sql` passes 74 assertions using `supabase db query --linked --file`.
- Authenticated hosted acceptance passes 51/51 assertions using four disposable identities: Personal User A, Personal User B, Organization Owner A, and Organization Owner B. Coverage includes cross-user Vault/Tap Card/received-card isolation; cross-organization submission/template isolation; organization denial of Vault access; ownership and default-template enforcement; pinned active template versions; all seven question types and numeric validation; request-only missing data and explicit save-to-Vault choice; immutable receipts; scoped export/deletion; one-time replay, revocation, and persistent-QR participant independence; and disposable-account deletion without removing other QA identities.
- Hosted Realtime verification passes four independent event assertions: admin session update, admin response insert, organization-owner response delivery, and organization-filtered session update. The app subscribes after identity-scoped setup, refreshes on subscription, cleans up on account change/unmount, exposes disconnected status, and retains manual refresh fallback.
- Final staging-configured Android build passes `:tapform-nfc-peer:testDebugUnitTest`, `:app:testDebugUnitTest`, `:app:assembleDebug`, `:app:assembleRelease`, and `:app:bundleRelease`. The native NFC module has 13 passing tests (9 protocol, 4 notification-selection); the app unit-test task is `NO-SOURCE`. Final artifacts: debug APK 271,683,228 bytes (`android/app/build/outputs/apk/debug/app-debug.apk`); release APK 132,086,576 bytes (`android/app/build/outputs/apk/release/app-release.apk`); AAB 85,828,406 bytes (`android/app/build/outputs/bundle/release/app-release.aab`). The APK and AAB use the Android Debug certificate and are QA artifacts, not publisher-signed deliverables. Release APK SHA-256: `C0B384572EDC474E4E1BEE32F5BC93546E7DDEA4CB51BDA39310BAF2461B819B`; AAB SHA-256: `78ECE3488641CE827A570E74FE37A25B7691E9D12148B8307E8C4E7FE465FF44`.
- The embedded release bundle contains the staging hostname, has demo mode disabled, and contains no detected service-role credential, QA identity pattern, or unrelated Supabase project ref. Generic localhost defaults/dev-server strings from upstream JavaScript dependencies are present in the bundle, but the app creates its Supabase client from the explicit build-time URL in `src/services/supabase.ts`; no app-configured endpoint points to localhost. The merged release manifest retains camera, NFC, Contacts, notifications, Internet/network state, and vibration; it excludes overlay and shared-storage permissions.
- The final standalone release APK cold-launches without Metro on the available Samsung Galaxy M13 (`SM-M135FU`). The authenticated Personal User B Home, Vault, Inbox/Requests/Received/Sent, Profile, expired request, replay-denial, and malformed duplicate-token states were exercised on-device. The expired request showed no Vault values; replay and duplicate token were denied safely. The Received list's singular field-count copy was corrected to `1 field`, added to automated tests, rebuilt, reinstalled, and visually verified. Contacts permission was not requested at startup and appeared only after explicit export; both grant and denial paths were exercised, and denial kept the card available with a clear fallback. The QA contact was moved to Samsung Contacts Recycle bin; because two exact-name rows were present, neither was permanently deleted to avoid touching a potentially pre-existing contact. TapForm READ_CONTACTS and WRITE_CONTACTS permissions were revoked and verified as not granted. No Android runtime or React Native fatal error was captured after cold launch.
- Temporary one-time-share QA link files and the disposable Tap Card used for device replay testing were removed. Hosted acceptance's temporary account was deleted and confirmed absent; the four persistent QA identities remain disposable staging-only accounts. QA passwords and backend administrative credentials remain in Windows Credential Manager and are not in the repository or client bundle.
- The M35 was unavailable during this run. Physical scanning between phones, M35 NFC/HCE/Reader Mode behavior, and final M35 regression remain unverified. The connected M13 lacks NFC, so a physical two-NFC-device exchange cannot be completed. NFC protocol and notification-selection software tests pass. No service-role or private signing secret is in client code.
- This record covers staging, not production Supabase configuration. Owner-controlled production backend configuration/key rotation, publisher signing, legal policy/public deletion disclosures, and any Play Console declarations/assets remain outside this engineering run; no Play Store submission or EAS account operation was performed.

## Release blockers to resolve before submission

1. Configure the separately owned production Supabase endpoint and rotated public client key for a production build; the verified artifacts in this record target disposable staging.
2. Sign the release with owner-controlled publisher credentials and verify the resulting publisher-signed AAB. Current APK/AAB are debug-signed QA artifacts.
3. Complete a real NFC peer exchange with a second NFC-capable Android phone. The M35 software/lifecycle checks and available two-phone QR flows are recorded in the 2026-10-01 final continuation below; the connected M13 has no NFC.
4. Complete owner/legal-controlled privacy policy, public deletion disclosure, and any publisher-facing declarations/assets before store submission. These external store operations were not part of this session.

## Final continuation — 2026-10-01

This entry supersedes earlier device-availability and artifact details above. It does not change the scope restriction against production Supabase or Play Store operations.

- Final checks: `npm test` passes **70 tests across 14 files**; typecheck, lint, Expo dependency check, Expo Doctor (**21/21**), and `npm audit` (**0 vulnerabilities**) pass. Kotlin NFC protocol and notification-selection tests pass **13/13**. Android `testDebugUnitTest` is `NO-SOURCE`; debug APK, release APK, and AAB builds pass. Hosted staging acceptance passes **76/76 assertions**. No code changed after these checks; the remaining code delta since the prior release checklist is the monochrome `greenWash` token adjustment.
- Hosted project **TapForm Staging** (`yngyfamebdvqilhiuart`) remains isolated from production. All repository migrations are applied and migration history is synchronized. Four disposable identities cover Personal A/B and Organization Owner A/B. Hosted coverage includes cross-user and cross-organization isolation, organization denial of Vault access, request/template ownership, replay/expiry/revocation, duplicate handling, all seven question types, missing-data persistence choices, immutable receipts and pinned template versions, scoped export/deletion, persistent QR independence, and Realtime event delivery/reconnect. No service-role key is in the client.
- Both authorized devices are connected and run the exact final standalone release APK (installed base APK SHA-256 matches the built artifact on each): M13 `RZ8TA145CRV` / `SM-M135FU`; M35 `RZCX925WV0N` / `SM-M356B`. The APK cold-launches without Metro. Recent logcat on both contains no fatal or JavaScript exception signatures. M35 NFC is on, `TapFormApduService` is registered, and the Reader Mode lifecycle was device-verified: enable on request start, disable on background/exit, and re-enable on resume. With NFC switched off through ADB, a real organization request fell back to its short-lived QR; NFC was restored to on. Release-build deep links to the motion gallery, state preview, NFC diagnostics, and developer-access routes all redirected to Profile. These checks do not constitute a physical NFC peer exchange.
- On final staging builds, M13's authenticated User A completed missing-data tests using the Event Registration request. With Grade/year absent from Vault and “Also save this new value to your Vault” off, Grade 11 appeared only in the receipt and the Vault remained blank. With the choice on, Grade 12 appeared in the receipt and was saved to Vault. Grade/year was restored to the original QA value of 10 afterward. Optional phone was explicitly excluded; the receipt reported four shared fields and one separate answer.
- M35 Owner A received new submissions in the open Submissions screen in real time after M13 submitted/declined requests; no restart or manual refresh was needed. Session restoration and account switching were verified. Disposable-account deletion, export share-sheet integration, network failure/retry, request-link restoration, and safe malformed/replayed-token outcomes are covered by the preceding run records and hosted tests.
- The user physically confirmed successful personal QR transfers in both phone directions during this session. Automated/hosted coverage verifies one-time replay rejection, expiry/revocation, persistent organization QR participant independence, and request/share routing. Do not interpret those checks as a physical camera scan of every QR variant on the final artifact.
- Final release artifacts: `android/app/build/outputs/apk/release/app-release.apk` (**132,101,100 bytes**, SHA-256 `B36C94BCC5BD6D301E9D42CDA441A4DDCB7DB4EF24E268C51809AA553DDE8389`) and `android/app/build/outputs/bundle/release/app-release.aab` (**85,842,878 bytes**, SHA-256 `59DC164E7D916BDEE844EC5C3C42A3824676B566304331D4AE6A1C8BA292F5FE`). The QA artifacts target disposable staging and are debug-signed; production endpoint/key configuration and publisher signing remain owner-controlled release steps.
- Physical hardware blocker: the M13 has no NFC. A real peer exchange still requires a second NFC-capable Android phone. No other M35-connected device task is currently blocked.
