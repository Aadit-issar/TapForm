# TapForm Privacy Policy — Draft for publisher and legal review

**Status:** Draft. Complete the publisher-controlled details and have counsel review this policy before publication. This describes the implemented product and local database contract; the hosted Supabase project, production retention job, and production account flows have not yet been runtime verified. It is not legal advice or a guarantee of a particular security outcome.

**Effective date:** [Publication date]  
**Publisher:** [Legal publisher name and address]  
**Privacy contact:** [Privacy contact email]  
**Public policy URL:** [Published policy URL]

## Information TapForm stores

When you create an account, TapForm uses your email address for authentication and may store the display name and account role you provide. You can add structured details to your private Vault, including identity, contact, education, address, and emergency-contact fields. Vault fields are associated with your account and can be changed or removed in the app.

Tap Cards store a name, category, expiry, ordering, and references to the Vault fields you choose. A Tap Card does not make all Vault data shareable. At transfer time TapForm reads the current value of each included field and creates a receipt snapshot of only those fields you approve. The recipient receives the values authorized for that transfer.

Organizations can store their organization profile, request templates, versioned field and question definitions, link settings, and request status. For each approved request, TapForm stores an immutable snapshot of the selected Vault values and the answers to that request's one-time questions. One-time answers are not added to your Vault. A declined request stores a decision receipt without Vault values.

TapForm also stores request and exchange identifiers, token hashes, expiry and status timestamps, and the technical records needed to authenticate, prevent replay, show history, and operate the service. If a request asks for information missing from the Vault, you enter it in the request flow and separately choose whether to save it to the Vault; TapForm does not silently add it. The app does not intentionally put Vault values, question answers, or authentication tokens in NFC, QR, request-link, or notification payloads.

## How information is shared

An organization request shows the organization, purpose, required and optional fields, retention description, and any one-time questions before submission. TapForm resolves selected Vault values on the server and stores a snapshot for that request. Organizations can access approved snapshots for their own requests through authenticated, row-level database policies. They do not receive direct access to your Vault.

For a personal Tap Card exchange, the sender chooses the fields in advance. The receiver reviews and accepts the exchange in TapForm before the server resolves and transfers those current values. A receiver can save the received card in TapForm, copy individual values, use their device's share/contact actions, or share a card back. These actions are user initiated.

NFC, QR codes, and request/share links are ways to locate an exchange or request. They carry an opaque reference, not the personal values being shared. Persistent organization QR codes create separate request sessions for participants. A one-time link is reserved while it is being reviewed and becomes used after a successful response. Revoked, expired, or already-used contexts are rejected by the backend.

## Device features and third-party services

Supabase provides authentication, PostgreSQL database storage, row-level access controls, and Realtime updates. The publisher controls the Supabase project, hosting region, retention configuration, subprocessors, and applicable transfer arrangements; those details must be completed for the deployed project before publication.

Camera access is requested when you open QR scanning and is used to read a code. NFC is used for nearby exchange references on supported Android devices. TapForm can use Android's notification system for request alerts; notification extras contain safe routing context rather than Vault data. If you choose to export a received card to device Contacts, TapForm asks for Contacts access at that time. Copy and share actions use Android or iOS system surfaces. Those operating-system features may process information under their own terms.

## Retention

For organization requests, the request template states a retention period of 7, 30, or 90 days. The database migration defines a scheduled job to remove approved Vault-value snapshots and question-answer content after that deadline. The service keeps non-sensitive status and count metadata for the activity receipt. The publisher must confirm that the migration and scheduled job have been applied and are running in the production Supabase project before relying on this retention description.

Personal Tap Card transfer snapshots are retained as exchange history while the relevant accounts and records remain. Archiving a received card hides it from the Inbox; it does not itself erase the transfer snapshot. Revoking a link prevents future use but does not remove a completed receipt. Account deletion removes the account's associated Vault and Tap Card data and the associated records managed by TapForm, subject to the deployed database relationships and any legally required retention.

## Account controls, export, and deletion

You can edit or remove Vault fields, manage Tap Cards, view request and sharing history, and export account data from Profile. The export is generated from data accessible to your account and is offered through the device share sheet; take care when choosing another app or destination.

You can request account deletion in Profile by entering the confirmation word shown in the app. The authenticated backend function deletes the account and cascaded TapForm data, including its Vault. The app signs out after the backend confirms deletion. A failed deletion is reported in the app and does not show a success state. The publisher should periodically verify this flow against the production project and provide a web deletion route if required by the applicable store policy.

## Security

TapForm uses authenticated requests, row-level security, owner-checked database functions, short-lived exchange contexts, replay checks, and selective transfer snapshots. These controls reduce access to information but cannot guarantee that a device, account, network, recipient, or third-party service will never be compromised. TapForm does not claim an independent security certification or regulatory compliance status.

## Children's privacy

The app has not been reviewed or configured as a child-directed service. The publisher must determine its intended audience, age restrictions, parental-consent requirements, and applicable child privacy obligations before distribution, especially if schools or minors are expected to use it.

## Your choices and privacy requests

You can choose what to put in the Vault, what to include in each Tap Card, and which optional request fields to share. You can decline a request. Depending on your location, you may have additional rights to access, correct, export, delete, or restrict personal information. Contact [Privacy contact email] for privacy requests that are not available in the app.

## Changes

This policy may be updated as TapForm or its service providers change. The publisher will publish the effective policy and update the effective date when changes are made.
