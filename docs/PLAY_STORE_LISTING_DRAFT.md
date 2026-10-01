# Google Play listing draft

**Status:** Draft only. The current local Android artifacts use QA Supabase configuration and Android Debug signing. Hosted backend behavior and two-device NFC transfer have not been verified; keep the NFC/device claims below out of a live listing until those checks pass.

## App name

TapForm

## Short description

Your information. Your control. Stop filling forms.

## Full description

Stop filling out the same information again and again.

TapForm gives you a private Vault for details you choose to save. Create Tap Cards for the information you want to share, such as a personal, work, school, or networking profile. Each card includes only the Vault fields you select.

When an organization needs information, its request explains who is asking, why, which fields are required or optional, and the stated retention period. Review the request, add missing details if needed, answer any request-specific questions, and approve or decline. One-time answers stay separate from your Vault.

A phone tap, QR scan, or request link only opens the secure request or exchange context. It does not send your personal information by itself. TapForm asks you to review a peer Tap Card exchange before transferring its selected fields.

With TapForm, you can:

- Keep identity, contact, education, and emergency details in your Vault.
- Create and manage Tap Cards with selected Vault fields.
- Use a Tap Card with a QR code or supported Android NFC exchange.
- Review organization requests and answer one-time questions.
- Complete missing information in context and choose whether to save it to your Vault.
- Receive a shared card, save it in TapForm, copy details, or share a card back.
- See requests, received cards, and sharing receipts in one Inbox.
- Export your account data or request account deletion from Profile.

TapForm does not claim organization identity verification, government-issued credential verification, an independent security certification, or regulatory compliance. NFC availability depends on the Android device and must be described only for devices and flows that have been physically validated.

## Store assets to prepare

- Current screenshots of sign-in, Personal Home, Vault, Tap Cards, request consent, questions, Inbox, Organization Templates, QR management, and Submissions.
- Feature graphic in the dimensions required by the current Play Console.
- Monochrome launcher and adaptive icons checked at small sizes.
- The published privacy policy URL, public account-deletion route if required, and support contact.

## Publisher-controlled listing facts to complete

- Legal publisher name, support details, countries, and public website.
- Target audience, age rating, and child privacy disclosures.
- Current target SDK, permissions, and account-deletion disclosures.
- Google Play Data Safety answers from `docs/PLAY_STORE_DATA_SAFETY.md` after verifying the production project and SDK behavior.
- Supported Android devices and NFC claims after two-phone physical tests.
- Current production screenshots and final pricing/availability (TapForm currently has no paid features in the app code).
