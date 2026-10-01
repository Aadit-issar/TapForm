# TapForm Graphics and Asset Inventory

**Visual source:** [`DESIGN.md`](./DESIGN.md)  
**Motion source:** [`MOTION.md`](./MOTION.md)

TapForm graphics exist to clarify identity, connection, privacy, or state. Use code-generated SVG for crisp scalable line art and simple geometry. Use React Native views for straightforward shapes and Reanimated for motion. Skia is installed and available for future measured rendering needs, but this foundation uses lighter SVG/views because its graphics do not need a canvas engine. All graphic colors are strictly monochrome: black, near-black, charcoal, graphite, gray, off-white, or white.

| Asset | Purpose and screens | Implementation | Form and dimensions | Monochrome treatment and states |
|---|---|---|---|---|
| `TapFormMark` | App identity in navigation, development gallery, NFC center, future notifications/app icon exports | React Native SVG; canonical T-and-contact-point geometry | Square viewBox; scalable, default 32×32 pt; accepts `size` and `color` | Single off-white/graphite stroke; no gradients. Static. Remains recognizable at 16 pt. |
| `NfcWaveVisual` | Personal Ready to Tap, organization waiting screen, request-found transition | SVG/view rings plus Reanimated transforms; mark at center | Square, default 224×224 pt, scales down to 168 pt without changing ring count | Thin graphite rings, bright neutral center. Ready slow pulse; searching faster pulse; found contracts; connected still; error still/disrupted. Never looks like a radar game. |
| `NfcRequestVisual` | Organization side while offering an active request | Composition using `NfcWaveVisual` and request context | Flexible square hero, 180–240 pt | Same states as NFC visual; expiry and status are text, not color. |
| `NfcReceiveVisual` | Personal Ready to Tap / reader state | Composition using `NfcWaveVisual` and `TapFormMark` | Flexible square, 168–224 pt | Reader-ready pulse; disabled/unavailable is static with explicit copy. |
| `NfcWaveRings` | Reusable signature motif when a full device composition is unnecessary | Reanimated circular views or SVG circles | Square; 3 rings, 144–224 pt | 1 pt grayscale stroke; only active while ready/searching. |
| `SecureVaultVisual` | Vault introduction or privacy explanation, not every vault category | Simple SVG frame with structured field lines and a center lock/mark | 112×112 pt square | Outline-only with one off-white focal point. Static; no shield glow. |
| `RequestFoundVisual` | Brief NFC/QR success bridge before consent | `NfcWaveVisual` in found state plus a small check/connection mark | 128–176 pt square | Rings contract once; center contrast rises, then stable. No data iconography. |
| `QrScanCorners` | QR scanner framing and generated-code framing | SVG or four native border-corner views | Overlay adapts to scanner viewport; corners 24–32 pt long | Thin neutral-gray corners. Scan line is optional and low-contrast; detected contracts once. Never covers code quiet zone. |
| `ShareTransferVisual` | Optional confirmation while server is processing an approved share | Small SVG line/connection composition | 80×80 pt | Static or one short path reveal; processing copy remains primary. Must not imply success before backend confirmation. |
| `ShareSuccessVisual` | Server-confirmed share and save confirmation | Reanimated/SVG `SuccessMark` | 48–64 pt icon inside 64–80 pt neutral container | Off-white check on graphite or dark check on off-white. Draw/reveal after confirmed status only. |
| `PrivacyShieldVisual` | Short privacy explanation, consent helper, security settings | Existing outline icon family or simple SVG shield | 18–28 pt inline; up to 64 pt in empty illustration | Neutral outline; pair with explanatory text. Not a badge for every field. |
| `EmptyActivityVisual` | Activity empty state | Small SVG timeline/list marks | 72–96 pt square | 2–3 graphite strokes and one off-white point; static. |
| `EmptyVaultVisual` | Empty or incomplete personal vault | Structured field lines using the mark geometry | 72–96 pt square | Neutral outline; static, with an actionable next step outside the art. |
| `EmptySubmissionVisual` | Organization submissions empty state | Two simple aligned field rows with a receiver frame | 72–96 pt square | Neutral outline; static. |
| `LoadingSkeleton` | Loading vault/activity/submissions lists | Native views with low-cost Reanimated opacity | Follows target row size; never a full-screen image | Charcoal and graphite only; animation stops when data or error arrives. |

## Asset rules

- Do not create art for decoration or fill empty space. Each asset must explain a state or reinforce TapForm identity.
- Keep line weights optically consistent: about 1.5–2 pt at 24 pt icon scale; use thinner strokes for large rings.
- Give QR codes a clean quiet zone and maintain black/white contrast. Do not overlay a logo, crop modules, or animate a scan line across a generated code.
- Use transparent vector backgrounds in UI components. Native app icons/splash/notification resources may require raster exports; derive these from the same mark geometry and inspect at actual sizes.
- The launcher icon, adaptive foreground/mask, and splash image use a newly generated monochrome T-and-contact-point mark. `assets/tapform-mark.svg` and `TapFormMark.tsx` are the vector sources; rerun `powershell -ExecutionPolicy Bypass -File scripts/generate-tapform-assets.ps1` after changing its geometry.
- Avoid photographs and raster illustrations for NFC, consent, vault, and status visuals. The product's UI geometry and field content should carry meaning.

## Implemented reusable assets

The foundation currently implements `TapFormMark`, `NfcWaveVisual`, `QrScanCorners`, `SuccessMark`, and empty-state line illustrations using React Native SVG/views with Reanimated where motion is useful. Skia remains optional and is not installed because these visuals do not need its rendering model.
