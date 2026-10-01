# TapForm Design System

**Status:** Visual source of truth for future TapForm interface work  
**Brand promise:** *Your information. Your control.*  
**Product pattern:** **Tap → Review → Approve → Transfer**

This document defines the visual language and interaction presentation for TapForm. Follow it when designing screens and components. It does not change the product's authorization, backend, NFC, or QR behavior: those flows remain governed by their existing specifications.

## 1. Overall design principles

TapForm should feel like a considered privacy tool: quiet, precise, capable, and human. It replaces repetitive form entry with a deliberate exchange between a person and a clearly identified organization. The interface should make that exchange understandable at a glance and put the person's decision at the center.

Users should feel that their information is organized, that a request is specific, and that they remain in control. Trust comes from visible organization identity, plain purpose and retention details, a field-by-field preview, an unmistakable approval action, and clear confirmation of what was actually shared. Never use visual polish to obscure uncertainty or imply verification that has not occurred.

Use a strict grayscale palette. Build hierarchy with type, spacing, alignment, shape, contrast, and restrained light—not with colored status badges or decorative gradients. Prefer a few well-resolved surfaces to a screen full of cards. Keep common actions direct and readable, with native-feeling touch behavior and generous targets.

## 2. Reference interpretation

### Primary: `design/main.png`

The primary reference governs TapForm's direction. Carry forward its near-black mobile canvas, crisp off-white typography, thin graphite borders, subtle metallic highlights, compact but legible grouped rows, and confident white primary actions. Its personal home establishes a short greeting, one prominent “Ready to tap” interaction, a concise Vault summary, and recent activity. Its tap screen uses a restrained concentric/radial signal around a phone rather than a busy illustration. Its request and received screens make the organization prominent and display information in explicit rows. Its consent screen separates required and optional fields and keeps sharing and declining as distinct, visible actions.

Use the reference's light rings, sweeping reflected edges, and polished graphite selectively: as a small hero treatment for the tap interaction or onboarding cover, never as a background effect on every screen. Preserve the reference's compact navigation and strong white-on-black contrast while simplifying any dense example content that does not serve the current task.

### Secondary references

- **`design/side ref1.webp`:** Borrow the disciplined thin dividers, grayscale data hierarchy, and restrained icon treatment. Do not carry over financial charts, price colors, dense analytics, or trading-specific typography.
- **`design/side ref2.webp`:** Borrow clear alignment and the way fine borders organize dense data without heavy fills. Its desktop dashboard density and chart-heavy composition are not mobile TapForm patterns.
- **`design/side ref3.webp`:** Borrow the controlled black space, soft sculptural lighting, and occasional immersive onboarding composition. Avoid its AI-product framing, glowing centerpiece as a general motif, glassy card effects, and oversized marketing copy in functional screens.

The main reference remains decisively dominant; side references refine craft only. No `side ref4` file was present in `design/` when this document was written.

## 3. Color system

Use these tokens as the default light-on-dark theme. Values are intentionally neutral; do not introduce colored semantic variants. When contrast needs improvement, move toward white or black rather than hue.

| Token | Value | Use |
|---|---:|---|
| `background` | `#090A0A` | App canvas and full-screen flows |
| `backgroundElevated` | `#101111` | Navigation backing, sheets, inset areas |
| `surface` | `#151717` | Primary grouped surface |
| `surfaceSecondary` | `#1C1E1E` | Nested rows, secondary groups |
| `surfaceActive` | `#292B2B` | Pressed/selected control fill |
| `border` | `#343737` | Primary panel/control outline |
| `borderSubtle` | `#252828` | Dividers and low-priority edges |
| `textPrimary` | `#F2F2F0` | Main text and high-emphasis icons |
| `textSecondary` | `#B8BAB8` | Supporting copy and secondary values |
| `textMuted` | `#858987` | Metadata, inactive navigation |
| `textDisabled` | `#5E6260` | Disabled labels only |
| `iconPrimary` | `#E7E8E6` | Active/action icons |
| `iconMuted` | `#858987` | Supporting icons |
| `overlay` | `rgba(0,0,0,0.72)` | Modal/sheet scrim |
| `buttonPrimary` | `#F1F2EF` | Primary action fill |
| `buttonPrimaryText` | `#111212` | Text/icons on primary action |
| `buttonSecondary` | `#151717` | Secondary action fill |
| `buttonSecondaryText` | `#F2F2F0` | Secondary action label |

Avoid pure white full-screen surfaces. Use `#FFFFFF` only for small optical highlights if a platform asset requires it. Disabled and inactive states must remain readable; do not use opacity alone to communicate state. Success, pending, declined, expired, and error states use the same grayscale system, distinguished by label, icon, and structure.

## 4. Typography system

Use the platform system sans-serif as the default: it renders reliably, supports accessibility scaling, and keeps the app native. Prefer regular and medium weights; reserve semibold for short headings and primary actions. Avoid mixing decorative font families.

| Role | Size / line height | Weight | Use |
|---|---|---|---|
| Display / hero | 34 / 40 pt | 500 | Short onboarding or tap-state headline |
| Screen title | 27 / 33 pt | 600 | Main screen heading |
| Section title | 17 / 23 pt | 600 | Group heading |
| Card/panel title | 16 / 21 pt | 600 | Named request, template, or panel |
| Body | 16 / 23 pt | 400 | Main reading and field labels |
| Secondary body | 14 / 20 pt | 400 | Explanations and secondary values |
| Caption | 12 / 16 pt | 400 | Brief helper text |
| Metadata / eyebrow | 11 / 14 pt | 600 | Small status, category, timestamps |
| Tab label | 10–11 / 14 pt | 500 | Bottom navigation |
| Button label | 15 / 20 pt | 600 | Action labels |

Treat sizes as points and allow system font scaling. Keep body line lengths short on phones. Use tracking sparingly: about `+0.08em` only for short uppercase metadata such as `REQUESTING` or `NFC ON`; never track body text. Monospaced numerals may be used for countdowns, short protocol status, and compact metadata so digits do not jump. Do not use a dot-matrix typeface for headings or body copy.

## 5. Spacing system

Use a 4 pt base scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Most layouts should use 16–24 pt horizontal screen insets, 24–32 pt between major sections, 12–16 pt within a grouped row, and 8 pt between a label and its value. Keep related content close and separate unrelated groups with space before adding another border. Respect device safe areas and leave room for system bars and gesture navigation.

## 6. Radius system

Keep four radii: `8 pt` for small controls and chips, `12 pt` for grouped rows or compact panels, `16 pt` for hero/request surfaces, and `24 pt` for full-screen sheets or large hero artwork. Use pill radii only for buttons, switches, or compact filters that are genuinely pill-shaped. Do not mix arbitrary radii within one component family.

## 7. Border, stroke, and divider system

Use 1 pt strokes. `border` defines the outer edge of a distinct interactive or elevated group; `borderSubtle` divides rows within a group. Inset dividers should align with text, not run under leading icons. Most surfaces need either a fill or an outline, not both at maximum contrast. Stronger strokes are reserved for focus, selection, QR boundaries, and keyboard-visible interaction—not for every item. Keep decorative NFC line art thin and low contrast; never let it compete with content.

## 8. Elevation and depth

Depth comes from small luminance changes, crisp edges, and layering. Use no ambient shadow on ordinary rows. On dark surfaces, use a subtle top-edge highlight or a very low, soft shadow for sheets floating above the app. Scrims darken the underlying page without blur-heavy glass treatment. A soft radial reflection is allowed inside the tap hero or a cover image; it must not tint the palette, reduce text contrast, or become a generic card background.

## 9. Iconography

Use one consistent outline icon family with rounded joins and a regular 1.75–2 pt visual stroke. Typical sizes: 20–22 pt for list leading icons, 22–24 pt for navigation/actions, 16 pt for inline status, and up to 28 pt for a single empty/error illustration. Keep icon containers limited to organization marks, tappable icon buttons, and meaningful status illustrations. A container is usually 40–48 pt, graphite-filled with a fine border. Do not put every icon in a badge. Avoid emoji, mixed icon styles, and decorative icons that add no information. Pair unfamiliar status icons with text.

## 10. Button system

All buttons have a minimum 48 pt height and at least 44×44 pt hit area. Use 16 pt horizontal padding and 12–16 pt radius. A bottom-anchored primary action may be 54–56 pt tall and must clear the safe area.

- **Primary:** off-white fill, near-black semibold label, optional trailing arrow. One dominant primary action per screen. Use for `Share 5 fields`, `Start request`, and a clear next step.
- **Secondary:** graphite fill or transparent dark fill with a 1 pt border, off-white label. Use for alternatives of comparable importance.
- **Ghost:** no fill, no outline; secondary text/icon. Reserve for low-priority navigation and inline actions.
- **Destructive:** dark fill with a stronger neutral outline and explicit `Decline`/`Delete` label. Do not make it red. For irreversible template deletion, confirm in a focused dialog.
- **Icon button:** transparent/graphite background, 44–48 pt target, accessible label. Use for back, close, settings, or a clearly named utility.
- **Bottom CTA:** full-width within screen insets, fixed above safe area when the decision must stay visible. It may sit on a subtly elevated footer separated by a fine top border.

Pressed states move to `surfaceActive` or slightly reduce fill luminance, with a short opacity/scale response (never below a legible contrast). Disabled primary actions use a graphite fill and `textDisabled`; accompany disabled consent actions with the reason when it is not obvious. Do not communicate disabled solely through low opacity.

## 11. Input system

Inputs use a dark `surface` fill, 1 pt `border`, 12 pt radius, and a minimum 52 pt height. Labels stay above the field rather than relying on placeholder text. Focus uses a brighter neutral stroke (`#777B79`) and a subtle surface lift; no colored glow. Filled values use primary text, hints use muted text. Error states use a clear inline message, warning icon, and stronger neutral border; explain how to fix the issue rather than relying on red. Disabled inputs use `surfaceSecondary`, a visible label, and disabled text.

Search fields may use a leading magnifier and a short placeholder. Select controls show current value and chevron; use a native picker or a readable sheet for choices. Switches have a distinct track and thumb in both states: selected uses a light track/dark thumb, unselected uses graphite track/light thumb; do not rely on hue. Required fields cannot be disabled. Optional-field controls must state that turning one off excludes it. Segmented controls, if needed, use a single outlined group and a solid neutral selected segment; avoid decorative tabs that look like buttons but do not act like them.

## 12. Card and surface system

Surfaces have distinct jobs; do not render every section as the same rounded rectangle.

- **Hero panel:** one large, restrained graphite region for Ready to Tap or a primary organization action. A line/ring motif may support the tap action. Keep headline, explanation, and action together.
- **Request panel:** a clearly bounded summary of the chosen template, purpose, field count, and expiry. Rows are separated with quiet dividers.
- **List item container:** usually a flat row on the page, optionally grouped by a shared panel; use separators and aligned trailing metadata.
- **QR panel:** centered high-contrast QR with a generous quiet zone and a distinct outline/surface. Keep request name, expiry, and scan instructions outside the code's quiet zone.
- **Consent group:** separate required and optional groups. Required values are visible; optional rows expose an explicit toggle. This is the only screen where a couple of grouped surfaces may sit together because they make the decision legible.
- **Stat panel:** use sparingly for one or two useful summaries. Prefer a simple number and label to charts or a dashboard grid.

## 13. Navigation system

Use a compact top bar: back/close control on the left when needed, centered or left-aligned screen title, and at most one utility action on the right. Keep organization identity in the page content when it is central to a decision; do not hide it in the navigation title. Back targets should be consistent and accessible.

Personal primary tabs are Home, Vault, Activity, Profile. Organization tabs are Home, Templates, Submissions, Profile. Show the active tab with a bright icon and label; inactive tabs stay muted but readable. Use a bottom tab bar for stable top-level destinations only. Request creation, scanning, review, and result details are pushed/full-screen flows where continuity and focus matter. Use a bottom sheet for a short choice or confirmation, not for the primary consent review or long forms. Prevent keyboard and bottom actions from overlapping; keep safe areas correct on Android and iOS.

## 14. Motion system

Motion should be subtle, quick, and purposeful. Typical timings: 100–140 ms for press feedback, 180–240 ms for state changes or small panels, 260–340 ms for screen transitions, and a slow 1.8–2.6 s loop only for the restrained NFC readiness pulse. Prefer ease-out entry and ease-in exit; avoid spring overshoot. Use motion to show selection, reveal a request state, confirm a completed action, or gently suggest proximity. Respect reduced-motion settings and provide a static, understandable state. Never delay approval or QR use for animation.

## 15. Haptics system

Use light impact for ordinary primary/secondary button presses and optional-field toggles. Use a medium impact once when NFC detects/establishes a peer, not continuously while scanning. Use a platform success notification haptic after the server confirms a share. Use a warning/error notification haptic for failure, expiry, or a declined action only when it helps the user notice a state change. Do not use haptics for every list tap, countdown tick, or animation frame. Respect system haptic settings.

## 16. Content density rules

Each screen has one primary task and one dominant visual element. Show only the information needed for that task plus enough context to build trust. Home screens should fit the hero, one concise status/summary, a small recent list, and navigation without becoming a dashboard. Use progressive disclosure for history details, template configuration, and profile settings. Keep consent fields readable without scrolling on common phones when feasible; if the request is longer, keep the organization/purpose anchored and the bottom decision controls available. Do not shrink type or row height just to fit more fields. Long names wrap naturally; avoid truncating requester identity or purpose.

## 17. Reusable component patterns

- **Personal home hero:** greeting (`Hello, {name}`), one short control-focused line, and a prominent Ready to Tap panel with NFC status text and a simple symbol. No chart, large metric grid, or repeated CTA.
- **Vault category row:** category label, completion count/status, concise chevron. Flat grouped list with a divider; the whole row is a 48 pt+ target.
- **Request template row:** template name, one-line purpose, requested-field count, and optional overflow action. Secondary metadata stays muted and never crowds the title.
- **Request summary card:** organization/template name, purpose, field count, expiry. Make the organization recognizable and expiry easy to find.
- **QR display card:** real scannable QR with at least a four-module quiet zone, strong black/white contrast, no rounded clipping over modules, and a short expiry/session label. Do not place a logo over the code.
- **Activity item:** organization, purpose, relative time, state label, and field count. Use icon/label/contrast for state; tapping opens the exact history detail.
- **Consent field row:** leading field icon only when it aids scanning, field label, value or privacy mask, and required status in the group—not repeated on every required row. Preserve consistent value alignment.
- **Optional field row:** field label/value plus an accessible switch and explicit selected state. A deselected row dims slightly and says or makes clear `Not shared`; the value must not look selected.
- **Organization identity block:** neutral mark/initials, full organization name, and honest status (`Demo organization` / `Unverified`). Never use a verified badge unless real verification exists.
- **Submission detail row:** field label left, shared value right or stacked on narrow screens. Allow wrapping and selectable text where useful; keep sensitive values masked until the organization is authorized to see them.
- **Empty state:** short heading, one helpful sentence, and one relevant next action. Use a quiet line icon only if it improves comprehension.
- **Error state:** plain-language explanation, recognizable neutral warning symbol, and an actionable retry/back/fallback control. Do not show stack traces or color-only status.

## 18. Screen-by-screen design intent

- **Onboarding:** a few calm, spacious steps; explain “Your information. Your control.” Use one focused statement per step and a restrained monochrome image or ring motif. Make Get Started and Sign In clear.
- **Sign in / sign up:** quiet, compact forms with labels, validation beside the relevant field, password visibility control, keyboard-safe layout, and clear loading/error states. Avoid marketing panels around the form.
- **Personal home:** greet the person, make Ready to Tap the signature element, then show Vault completion and a few recent items. Keep it useful and sparse.
- **Ready to Tap:** full-screen focused state with `NFC ON`/disabled/unavailable stated plainly, a soft concentric signal, “Ready to tap,” and one concise explanation. State errors and QR alternative without implying NFC works when it does not.
- **Vault:** simple category rows and completion counts. No dense tile grid. Show missing categories clearly.
- **Vault category detail:** readable labeled values, edit affordance, short privacy explanation where relevant, and clear save/cancel behavior. Keep keyboard actions visible.
- **Activity:** chronological, low-density list with organization, purpose, time, status, and number of fields. Empty state should explain that approved/declined requests will appear here.
- **Activity detail:** show requester, purpose, date, final outcome, and exact fields shared (or explicitly that none were shared). Use masks only where the product's access rules require them.
- **Profile/settings:** account identity, role, privacy/security information, useful settings, and sign out. Demo tools must be clearly marked development-only.
- **Organization home:** organization name/status first, one dominant Start Request action, then a short saved-template list and recent submissions. Avoid dashboard widgets.
- **Templates list:** clear template rows with purpose and field count, plus one creation action. Keep destructive actions in an overflow menu and confirm deletion.
- **Template editor:** purposeful form sections for name, purpose, retention, and canonical fields. Show required/optional controls inline. Keep save action persistent when editing, but keyboard-safe.
- **Start request:** confirm the selected template and exact field summary before starting. One clear action creates the session; communicate the actual session lifetime.
- **QR request screen:** organization and template title, obvious QR, short scan instruction, visible countdown, and a quiet NFC/QR status. Keep Cancel available without competing with the code.
- **Waiting for approval:** status headline plus organization/request context. Explain that the user must review and approve; do not show a fabricated connection or a spinner without status text.
- **Consent:** see the dedicated requirements below. It is a decision screen, not a marketing page.
- **Success:** restrained check icon, “Shared,” exact count and recipient, purpose, and a route to details. Keep confirmation legible and immediate.
- **Information received:** clear received state and person/request context, followed by only the approved values in a tidy list. This screen must be readable at presentation distance.
- **Submissions:** chronological organization-side list with requester, template, time, and outcome. Empty/loading/error states should use the same restrained system.

## 19. Consent screen — highest priority

The user must know who wants what, why, and what will happen before acting. Keep the organization identity and purpose near the top and preserve them when a long field list scrolls. The exact requested fields must be visible; do not collapse them behind “personal information” or a generic permission summary.

Recommended order:

1. **Organization identity:** mark/name, with honest verification/demo status.
2. **Request title and purpose:** a clear heading such as `Event Registration` and a plain-language purpose.
3. **Field groups:** `REQUIRED` and `OPTIONAL` as explicit section labels. Required fields show the actual value or a privacy mask plus the field name, and cannot be toggled off. Optional fields show a switch in the selected state by default only if product logic explicitly defaults them on; the row must make it easy to deselect. Required/optional must not depend on tiny icons or color.
4. **Retention and privacy:** concise, visible lines such as `Retention · 30 days` and `Only these fields will be shared.` Place this directly above or within the decision area, not behind a policy link.
5. **Decision controls:** a prominent primary label with exact selection count, e.g. `Share 5 fields`, and a distinct secondary `Decline`. Update the count immediately when an optional field changes. Keep both reachable without hiding a selected field or value.

Use a calm neutral surface with fine dividers between rows. Distinguish a masked sensitive value from a missing value in both text and accessibility labels. If a required value is missing, replace the approval affordance with a clear missing-data explanation and an `Add information` route; never present an enabled action that will fail silently. On narrow screens or larger text sizes, allow the content to scroll while the requester context and bottom decision area remain discoverable. Screen-reader order follows requester → purpose → required fields → optional fields and selected states → retention/privacy → share → decline. Announce field-count changes. No flourish, illustration, or animation may compete with the decision.

## 20. Notification UX guidance

An incoming request notification should be discreet by default because the device may be locked or visible to others. Lock-screen text should say `TapForm request` and a neutral prompt such as `Open TapForm to review`; do not reveal organization, purpose, or requested personal fields on a public lock screen unless the user has explicitly enabled previews. On an unlocked device, the organization name may be shown, but never imply approval or transfer.

Compact notifications use a short title, one sentence, and a single `Review` action that opens the authenticated app. Expanded notifications may show the requester and purpose plus `Review request`; do not put Share/Approve directly on the notification because the exact field list and optional choices belong on the in-app consent screen. Tapping a notification deep-links to the pending request, validates it with the backend, then presents the same full consent screen as NFC/QR. If expired or unavailable, explain that before showing any approval controls. Notification permission denial must not block in-app use.

## 21. Product copy style

Use short, calm, concrete sentences. Prefer active verbs and familiar language. Do not use security theater, technical transport terms, legalistic phrasing, or claims that exceed the actual system behavior.

Preferred terminology: **Vault** (the person's saved information), **Request** (an organization's defined need), **Share** (the user's explicit action), **Activity** (a person's request history), **Template** (a reusable organization request), **Submission** (the organization-side approved response). Say `Only these fields will be shared`, `Request expires in 1:42`, `Phone number excluded`, `Shared with Northfield Tech Fest`, or `This request has expired. Ask the organization to start a new one.` Avoid vague labels such as `Continue`, `Allow access`, or `Submit` when a more specific action is possible.

## 22. Visual anti-patterns

TapForm must not look like a colorful SaaS dashboard, finance terminal, generic AI assistant, cyberpunk utility, or a stack of identical white cards. Do not use purple, green success, red error, amber warning, neon, colorful category chips, flashy gradients, glossy glass panels, heavy blur, thick shadows, oversized stats, decorative charts, or constant glowing rings. Do not use color as the only status signal; tiny low-contrast text; all-caps body copy; novelty/dot-matrix typography for reading; unlabelled icons; emoji; or inconsistent corner radii. Do not hide the organization, purpose, field list, retention, or decision behind an accordion. Do not turn consent into a one-tap generic permission prompt. Do not show a verified appearance for an unverified organization, expose personal details in notifications, or use imagery that implies a background NFC transfer has already shared data.

## Implementation notes

Build tokens and reusable primitives from this document before styling individual screens. Preserve native platform behavior for focus, keyboard, safe areas, system bars, accessibility scaling, and reduced motion. Validate contrast and touch targets on physical-size layouts, including small screens and long organization/field values. When a new visual decision is not covered here, choose the simplest neutral treatment that keeps the user's decision and the exact shared data clear.
