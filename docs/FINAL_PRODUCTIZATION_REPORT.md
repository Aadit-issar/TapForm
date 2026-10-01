# TapForm Final Productization Ledger

This ledger records verified work and unresolved environment limits for the takeover. Local PostgreSQL results below are **not** Supabase-hosted runtime results.

## Phase 1 — Takeover and baseline

- **ACTION:** Preserved the pre-existing dirty/untracked repository and read the overnight report, design/motion/assets references, release checklist, privacy draft, Play listing, and Data Safety draft.
- **COMMAND:** `git status --short`; `git diff --stat`; `git diff --cached --stat`; source/config/docs inspection.
- **RESULT:** Repository is an uncommitted initial import with extensive user work and captured device references. No reset, clean, or remote write was performed.
- **VERIFICATION:** Baseline `npm test` 8 files / 40 tests; typecheck; lint; Expo install check; Expo Doctor 21/21; npm audit 0 vulnerabilities; Android Kotlin tests and `assembleDebug` passed.
- **BLOCKER:** Docker engine unavailable. Linked Supabase project `wozjixwagucyrfmbdwpc` is active, but its dev/staging/production classification is unknown; no remote migrations or test identities created. EAS CLI is not authenticated.

## Phase 2 — Isolated PostgreSQL migration and security verification

- **ACTION:** Installed local PostgreSQL 16 with pgTAP in WSL and applied all seven migrations to a fresh isolated `tapform_qa` database using minimal `auth.users` / `auth.uid()` stubs. No hosted project was altered.
- **COMMAND:** Lexically ordered `psql -v ON_ERROR_STOP=1 -f supabase/migrations/<migration>.sql`; executed `supabase/tests/rls.test.sql` and `supabase/tests/exchange_access.test.sql` through `psql`.
- **BUG:** Clean migration 202609280003 unconditionally revoked `seed_demo_account(text)`, although the function is created later by `supabase/seed.sql`.
- **FIX:** Made seed-helper revocation conditional on function existence in migrations 202609280003 and 202609300001; removed the migration-time authenticated grant so the local seed file owns fixture access.
- **BUG:** RLS test helpers `is_rls_enabled` and `policies_are` were not installed in standard pgTAP.
- **FIX:** Added transaction-local `pg_temp` helpers backed by PostgreSQL catalogs and standard pgTAP assertions.
- **BUG:** `validate_request_answers` used an inner alias that shadowed its PL/pgSQL record; it also allowed an authenticated caller to probe arbitrary request versions.
- **FIX:** Renamed the inner alias and require the caller to be an organization member for the version or the participant in a session pinned to it.
- **BUG:** Exchange test did not supply a separate required choice while testing optional answer validators and called `save_request_template` with an inferred `integer` where the RPC requires `smallint`.
- **FIX:** Corrected answer fixtures and cast the retention argument explicitly; expanded checks across all question types, bounds, invalid choice/date handling, and authorization.
- **VERIFICATION:** Fresh migration chain applied successfully. RLS suite **59/59**; exchange/access suite **53/53** at the initial run, including replay rejection, duplicate request approval, snapshot immutability after Vault edit, answer/Vault separation, account-scoped export content, and backend account deletion.
- **LIMITATION:** This verifies PostgreSQL migrations, role policies, and SQL routines against the local Auth stub. Supabase Auth, PostgREST RPC, hosted RLS, Realtime delivery, Cron operation, and project data remain unverified.

## Phase 3 — Authenticated device and client hardening

- **ACTION:** Rebuilt and installed the standalone release APK on Samsung Galaxy M35 (`SM-M356B`, `RZCX925WV0N`) with no Metro dependency; cold launch reached the authenticated Organization home. Read-only screen inspection reached Templates and Submissions.
- **BUG:** Templates and Submissions show retryable load errors because the linked hosted project has not received the new schema migrations.
- **FIX:** No client workaround can safely substitute for server schema; kept the errors explicit and did not mutate an unclassified backend.
- **BUG:** Direct account switches could retain old Vault/profile state, and a slow prior profile response could overwrite the new account’s role/display name.
- **FIX:** AppState now clears account-scoped state on identity change, rejects stale Vault/profile callbacks by identity epoch, and remounts route state for the new identity.
- **BUG:** A hard-coded developer password was included in the JavaScript source bundle.
- **FIX:** Removed the password and entry field. Local preview tools remain behind development-build route checks and an explicit dev-only unlock.
- **VERIFICATION:** After these client changes: `npm test` 8 files / 40 tests; TypeScript; lint all pass. Final rebuilt-on-device verification still required.
- **BLOCKER:** No disposable hosted QA accounts; authenticated personal and organization end-to-end flows on the device have not been safely exercised. Existing device session was used read-only.

## Phase 4 — Consent, permission, and publication hardening

- **BUG:** A peer could edit a Tap Card after the receiver reviewed it, causing acceptance to resolve a different field selection than the one shown during review.
- **FIX:** The join RPC locks the parent card and stores the reviewed field-key snapshot on the exchange session. The accept RPC resolves only those pinned fields. A regression test edits the owner's card after join and confirms the transfer still contains only the reviewed field.
- **VERIFICATION:** Reapplied the complete seven-migration chain to a fresh local PostgreSQL database; RLS **59/59**, exchange/access **53/53**. Queried the catalog: all 29 `SECURITY DEFINER` functions in `public` have an explicit function-level `search_path`.
- **BUG:** Malformed SecureStore JSON for an interrupted request returned an empty result without deleting the invalid record; it could be re-read on every launch.
- **FIX:** Pending-review storage now deletes malformed current and legacy records. Added tests for request-context persistence, per-session clearing, legacy migration, and corruption cleanup.
- **VERIFICATION:** Client tests passed **43/43** at this phase checkpoint. Expanded exchange/access suite passes **58/58**, including local cron scheduling and expired field/answer cleanup while preserving receipt counts. These are local PostgreSQL results with an Auth stub, not hosted Supabase verification.
- **ACTION:** Removed unused overlay and legacy shared-storage permissions with Expo's `android.blockedPermissions`; regenerated CNG Android files from app config and verified the merged release manifest contains neither. The overlay permission appears only in React Native's debug manifest. Camera, NFC, Contacts, notifications, network, vibration, and Android SecureStore permissions remain.
- **ACTION:** Updated the privacy and Play Data Safety drafts to describe request-only missing-data entry, separate One-Time answers, Contacts permission behavior, and the unverified hosted retention job.
- **FIX:** Restored the ignored machine-local `android/local.properties` SDK path after CNG prebuild; no hand edits were made to generated Android sources.

## Phase 5 — Final routing, release, and device audit

- **BUG:** Post-auth link restoration was inline in the sign-in screen and had no direct regression coverage.
- **FIX:** Extracted a strict allowlist for request/share tokens and notification return paths; added valid, malformed, duplicate, and external-destination tests. The sign-in flow now only replaces to an allowlisted TapForm route.
- **VERIFICATION:** Final JS suite **45/45** across 9 files; typecheck and lint pass; Expo install check passes; Expo Doctor passes **21/21**; npm audit reports **0 vulnerabilities**.
- **VERIFICATION:** Final local database suites pass **59/59 RLS** and **67/67 exchange/access** assertions. Missing-data cases verify required completion, optional omission, request-only submission, and explicit save-to-Vault choice. All 29 public `SECURITY DEFINER` routines have explicit function-level `search_path`. No hosted Supabase writes were made.
- **VERIFICATION:** Final Android run passes NFC Kotlin tests **11/11**, `:app:testDebugUnitTest`, `assembleDebug`, `assembleRelease`, and `bundleRelease`; release JS bundle contains the final routing/storage fixes.
- **ARTIFACTS:** Debug APK 267,643,395 bytes; release APK 132,072,052 bytes; AAB 85,828,241 bytes. Paths are recorded in `docs/RELEASE_CHECKLIST.md`. APK/AAB verify with the Android Debug certificate, not publisher credentials.
- **DEVICE:** Installed the final standalone release APK on Samsung M35 (`SM-M356B`); cold launch and `/scan` rendered without Metro, fatal crash, or captured JS exception. The current device state is signed out. A prior authenticated read-only Organization pass reached Home, Templates, and Submissions; the latter showed retryable schema errors because the hosted database is unclassified and unmigrated. No disposable account was available for a fresh authenticated pass.
- **QR/NFC:** Signed-out scanner route is physically rendered. A synthetic invalid share QR was displayed for a camera test, but no successful decode was observed. Actual two-phone NFC remains unavailable. Deep-link routing to the signed-out sign-in screen is device-tested; post-auth restoration is automated-tested, not authenticated-device-tested.
- **SECURITY HYGIENE:** Client/native source scan found no service-role key, private key, signing password, hard-coded developer password, localhost endpoint, or test-account credential. Generated release manifest has no overlay or legacy shared-storage permission.
- **PUBLICATION:** Privacy, Data Safety, Play listing, and release checklist drafts updated with evidence and limits. Local app configuration points at QA/placeholder Supabase values; the EAS production environment, publisher keystore, Play Console, public policy/deletion URLs, and legal review remain owner-controlled.

## Remaining work and blockers

- **ENGINEERING BLOCKERS:** Full feature-by-feature visual and authenticated device acceptance remains incomplete because the app has no disposable QA login on the M35. Physical QR decoding and end-to-end signed-out-to-authenticated restoration were not confirmed. No second phone was available for real NFC exchange.
- **ENVIRONMENT BLOCKERS:** Hosted Supabase project could not be classified as disposable development/staging, so migrations and writes were correctly withheld. Local PostgreSQL tests do not verify Supabase Auth, PostgREST, hosted RLS, Realtime, backups, or deployment Cron. EAS credentials and Play Console access are not configured.
- **OWNER-CONTROLLED:** Publisher signing credentials, production Supabase configuration and key rotation, store account/legal identity, published privacy/deletion URLs, audience and Data Safety declaration, and legal approval.
- **STATUS:** All meaningful local engineering, SQL security, build, and available device checks are complete. TapForm is **not ready for professional display or Play publication** while authenticated backend flows and fresh device acceptance remain unverified. Local release APK/AAB are QA-configured and debug-signed only.

## Final continuation — 2026-10-01 (supersedes earlier remaining-work status)

- Hosted staging is now available and verified; the former unclassified-backend/local-PostgreSQL blockers above are historical. Hosted acceptance passes 76/76 assertions across disposable Personal A/B and Organization Owner A/B identities. The latest final-artifact app checks include live Realtime submission arrival, account switching/session restoration, export UI, disposable deletion, request-link restoration, network retry, and both missing-data save choices. The no-save path left Grade/year absent from Vault; the opt-in path saved it; the QA value was restored afterward.
- Final regression passes: 70 JavaScript tests across 14 files, typecheck, lint, Expo install check, Expo Doctor 21/21, npm audit with 0 vulnerabilities, 13/13 Kotlin NFC/notification tests, and Android debug/release/AAB builds. Both phones run a byte-identical copy of the final staging release APK. Recent logcat on both has no fatal or JavaScript exception signatures.
- The user confirmed successful personal QR scans in both phone directions. M35 NFC is enabled and TapForm HCE is registered; final-build Reader Mode enabled on request start, disabled on background/exit, and re-enabled on resume. Turning NFC off through ADB made an organization request fall back to a short-lived QR; NFC was restored. Release deep links to development galleries/diagnostics redirected to Profile. A physical peer NFC exchange remains untested because the M13 has no NFC. Do not describe this as successful two-phone NFC.
- Final artifact hashes, hosted project ref, exact counts, and remaining release steps are recorded in the 2026-10-01 continuation in `docs/RELEASE_CHECKLIST.md`. The artifacts target disposable staging and use the Android debug certificate. Production Supabase endpoint/key selection and publisher signing remain owner-controlled; no EAS or Play Store submission was performed.
- **CURRENT STATUS:** Ready for professional display on the verified staging configuration. A production-configured, publisher-signed artifact and physical two-NFC-device exchange remain outstanding; the latter needs a second NFC-capable Android phone. Earlier status and blocker statements in this report do not describe the final continuation state.
