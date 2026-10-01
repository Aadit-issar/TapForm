# TapForm Motion and Interaction System

**Applies to:** future product UI and reusable interaction components  
**Visual source:** [`DESIGN.md`](./DESIGN.md)

## Motion character

TapForm motion is restrained, quick, tactile, deliberate, and calm. It should communicate hierarchy, confirmation, connection, security, and state change. It must never feel flashy, playful, or like an animation demo. Use monochrome values only; motion never adds colored glows or colored success/error states.

Animate only properties that improve comprehension or touch feedback. Prefer opacity, transform, and simple dimensions on the UI thread. Avoid layout churn, continuous JavaScript timers, particles, blur, and permanent loops outside the active Ready/Search state.

## Timing and easing

| Interaction | Duration / feel |
|---|---|
| Finger-down response | 70–110 ms; immediate |
| Button release | 150–210 ms low-overshoot spring |
| Row/switch state | 150–200 ms |
| Content enter/exit | 180–240 ms |
| Route/sheet transition | 220–300 ms, platform-appropriate |
| Success mark reveal | 180–260 ms |
| NFC Ready pulse | 2.2–3.0 s per ring, staggered |
| NFC Searching pulse | 1.3–1.8 s per ring, staggered |

Use a soft ease-out for entering and ease-in for leaving. Press springs should be critically damped or nearly so; no overshoot greater than a few percent. Keep an ordinary interaction under 300 ms. A deliberate waiting state may persist, but its motion stays slow and quiet.

## Press and selection behavior

### Buttons

On finger down, compress to scale `0.98` (allowed range `0.975–0.985`) and shift fill/opacity slightly. On release or cancellation, spring back to `1`. Keep the touch target stable; never scale the Pressable hit area itself. Light haptic feedback is reserved for meaningful actions and is emitted once per activation, never on both press-in and press callbacks.

### Cards and rows

Use a surface luminance shift first. If movement is useful, limit it to scale `0.995–0.99` or a 1 pt vertical movement. On release, restore in 160–200 ms. Non-interactive content does not animate on touch.

### Tabs and navigation items

Change selected icon/text contrast immediately; add a 140–180 ms opacity or small underline/fill transition where needed. Ordinary tab navigation has no haptic by default.

## Screen and sheet transitions

- **Push:** 220–280 ms forward movement/fade consistent with the platform stack. Keep content legible throughout.
- **Back:** reverse the same transition; do not add a second flourish.
- **Modal:** 220–280 ms slide/fade with a neutral scrim. Focus moves into the modal, then returns to its opener when dismissed.
- **Bottom sheet:** 200–260 ms upward ease-out, with a clear resting position and accessible dismiss control. Avoid rubber-band bounce.
- **Success route:** reveal the confirmed state only after backend success. A short fade/translate is enough; no confetti or full-screen flash.

## Consent interactions

Field rows enter as one calm group or in a short stagger (no more than 20 ms between rows); avoid making the user wait to read them. Turning an optional field off animates the switch and reduces the row's emphasis over 150–190 ms. Keep its label visible and mark it as excluded. The `Share N fields` count transitions over 120–180 ms with stable width or tabular numerals. Required fields never animate into a disabled state because they cannot be deselected.

## Request found

On a valid NFC/QR join: signal detection with one medium haptic, contract the NFC rings over 160–220 ms, briefly brighten the center in grayscale, and change the label to `Request found`. Present consent promptly; the complete detection-to-review transition should feel immediate, normally within 300–450 ms. Do not insert an artificial pause. Invalid, expired, or unauthenticated requests do not use the success transition.

## Share and decline

### Share

1. Button compresses and emits one light tap haptic.
2. Button becomes an inline processing state; prevent a duplicate press.
3. Keep the selected-field summary stable while the server processes.
4. Only after the backend confirms, reveal the check mark and emit the success haptic.
5. Transition to the confirmation screen.

Never optimistically display “Shared” or a success check before server confirmation. On failure, restore the enabled action when retry is valid and retain the user's selection. Explain expired/consumed states without implying that data was transferred.

### Decline

Use a brief pressed state and a quiet route/state change. Do not shake, flash, or use red. If confirmation is required by product logic, use a small neutral confirmation sheet; never make declining feel punitive.

## Loading, errors, and empty states

- **Lists:** use static, low-contrast skeleton rows that pulse opacity slowly (about 1.4 s); stop when content arrives or the screen loses focus.
- **Button actions:** show a small inline activity indicator or label such as `Sharing…`; preserve button size.
- **App initialization:** keep the native splash visible only while local auth/session state and the first route are resolved. Hide it promptly; do not stage a splash animation.
- **Request joining:** use the NFC/QR state graphic and one concise status line rather than a giant spinner.
- **Errors:** show stable explanatory text. A 2–3 px horizontal shake over 160–200 ms may be used once for an invalid form submission, only if reduced motion is off. Network errors and expired sessions should not shake.
- **Retry:** animate the retry action like an ordinary button and show a small inline progress state.
- **Empty states:** appear without entrance animation by default; a subtle 180 ms fade is acceptable when reached after an action.

## Haptics

Route all haptics through `src/services/haptics.ts`; do not call Expo Haptics directly from screens.

| Helper | Use |
|---|---|
| `tap()` | Meaningful primary action; light |
| `selection()` | Optional field, selection/filter change |
| `requestFound()` | Valid NFC/QR request discovered; medium, once |
| `success()` | Server-confirmed share or save |
| `warning()` | Request near expiry only if an explicit attention event is needed |
| `error()` | Action failed or request is invalid/expired |

Ordinary navigation, scroll, repeated countdown updates, and passive state changes are silent. Respect platform settings; haptic failure must never break the action.

## Reduced motion and performance

Use Reanimated's reduced-motion setting. When enabled, remove continuous pulses, scale springs, and shakes; retain immediate state changes, readable labels, and a short opacity change only when necessary. The static graphic must communicate every state without animation.

On mid-range Android hardware, keep at most three low-cost ring loops active. Use Reanimated UI-thread styles for transforms/opacity. Do not keep animations alive when the NFC screen is unfocused, disconnected, or in an error/complete state. Keep text measurement, network work, state transitions, and haptic calls off animation worklets. Avoid Skia effects unless a measured visual benefit justifies their GPU cost.

## Reusable motion primitives

Build from the small set in `src/components/motion/`: `AnimatedPressable`, `AnimatedCard`, `FadeInSection`, `AnimatedProgress`, `AnimatedCounter`, `AnimatedToggleRow`, `SuccessMark`, `PulseRing`, `LoadingSkeleton`, and `RequestTransition`. Keep component props explicit and defaults conservative. Route/business state stays owned by the screen/domain; these components only present state and emit user intent.
