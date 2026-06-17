# Klip — Asset Brief

A local, offline-first desktop app for organizing downloaded source videos and the
short cuts (clips) made from them — a warm, premium personal vault for video.

## Design system

- **Palette — "Honeyed Amber" (light surface):**
  - Warm-white surface: `#FBF8F1`
  - Deep espresso (chrome + icon backgrounds): `#1C1815` — gradient `#241E19 → #16110E`
  - Honey gold (primary / accent): `#EAB44C` — mark gradient `#F7D488 → #EAB44C → #D89B33`
  - Espresso ink (wordmark, detail on light): `#1C1815`
  - Cream (marks on dark): `#F5ECD5`
  - Warm muted taupe (secondary text): `#6B5E4F`
- **Palette — dark surface:**
  - Espresso surface: `#1C1815` — gradient `#241E19 → #15110E`
  - Cream ink (wordmark, detail on dark): `#F5ECD5` (≈14:1 on espresso — well clear of WCAG AA)
  - Warm muted cream (tagline on dark): `#C9BBA2` (≈7:1 on espresso)
  - Honey gold accent + gradient: unchanged (reads warmly on espresso)
  - *All neutrals are warm-tinted — never cool gray.*
- **Fonts:** Geist (clean modern grotesk) — SemiBold (600) wordmark, Regular (400)
  tagline → `'Geist','Inter',system-ui,sans-serif`. Geist is OFL; static weights are
  provisioned into the generator's `fonts/`.
- **Shape language:** soft, generously rounded, friendly. Rounded-square icon at ~18%
  corner radius (`rx 184` @ 1024) to match the app's `0.75rem` UI radius. Mark = a
  single **film frame** — a rounded-square bracket — cradling a **play head** (rounded
  triangle), with a small **trim tab** (rounded-rect, `x468 y159 w88 h124 rx30`) fused
  to the centre of the top rail — an in/out trim point on a scrubber: "mark a moment and
  cut it." The whole mark group is shifted **+25y** so the upward tab stays bbox-centred
  (vbbox 184–840, symmetric 184/184 margins). Honey-gold mark with a subtle warm
  top-left→bottom-right gradient on a deep-espresso tile.
- **Voice:** cozy, refined, archival, calm. Never techy, neon, or cold.

## Assets

| Type | Source | Preset | Outputs |
|---|---|---|---|
| app-icon | src/icon.svg | app-icon | icons/icon-{16,32,48,64,128,256,512,1024}.png |
| logo (square, light) | src/logo.svg | logo | logos/logo-{1x,2x,3x}.png |
| logo (square, dark) | src/logo-dark.svg | logo-dark | logos/logo-dark-{1x,2x,3x}.png |
| logo (horizontal, light) | src/logo-horizontal.svg | logo-horizontal | logos/logo-horizontal-{1x,2x,3x}.png |
| logo (horizontal, dark) | src/logo-horizontal-dark.svg | logo-horizontal-dark | logos/logo-horizontal-dark-{1x,2x,3x}.png |
| og-banner | src/banner-og.svg | og-banner | banners/banner-og.png |
| github-banner | src/banner-github.svg | github-banner | banners/banner-github.png |

### Platform bundles
| Platform | Preset | Outputs (under platforms/<name>/) |
|---|---|---|
| windows | windows | app.ico (16–256), README.md |
| macos | macos | AppIcon.icns + AppIcon.iconset/ (10 PNGs, inset + shadow), README.md |
| linux | linux | hicolor/<size>/apps/klip.png (16–512), hicolor/scalable/apps/klip.svg, klip.desktop, README.md |

Platform bundles built with `--name "Klip" --theme "#EAB44C" --bg "#FBF8F1"`.

## History

### create — 2026-06-16
**Request:** Klip — warm, premium offline vault for video. Asset types: app-icon, logo,
og-banner, github-banner. Platform bundles: windows, macos, linux. Palette "Honeyed
Amber" (honey gold, deep espresso, cream, warm-white; warm-tinted neutrals). Geist
typeface. Icon: a clip mark — a film frame / rounded bracket cradling a play head.
**Notes:**
- Mark is the full icon scaled into a self-contained espresso badge across logo +
  banner lockups, so the gold reads on any surface; only the wordmark ink changes per
  surface (espresso on light, cream on dark).
- Icon geometry: espresso rounded-square (`rx 184`, ~18%); film-frame ring at
  `x/y 246, 532×532, rx 132, stroke 74`, bbox-centered on 512; play triangle
  `M470 436 L470 588 L598 512` (round joins), centroid x≈512.7 — geometrically centered.
  Verified legible at 32px and 16px.
- Wordmark renders in **Geist SemiBold**; tagline ("A warm, offline vault for your videos
  and the clips you keep.") in Geist Regular. Banners carry faint oversized frame motifs
  in opposite corners for warmth without noise.
- Tooling note: sharp's bundled fontconfig on Windows ignores `FONTCONFIG_FILE` and only
  scans the OS user-font dir, so the generator now mirrors its `fonts/` into
  `~/.local/share/fonts` (`syncUserFonts()` in `fonts-env.js`) — otherwise text silently
  fell back to a system monospace.

### edit 1 — 2026-06-16
**Request:** Refine the app-icon mark only — add a single trim/scrubber notch centred on
the top edge of the gold film-frame (an in/out trim point: "mark a moment and cut it"),
geometric and warm, a clear accent that doesn't overpower the play head; keep everything
else (palette, espresso tile, gold gradient, ~18% radius, Geist SemiBold wordmark,
taglines) as-is; stay bbox-centred and crisp at 16px; re-export the icon set plus the
logo and banner lockups that embed the mark.
**Interpretation:** Mark geometry only — no palette/font/wordmark/tagline change. Added a
solid honey-gold **trim tab** (rounded-rect `x468 y159 w88 h124 rx30`) fused to the
centre of the top rail (sits on its straight span x378–646; tab centre x=512). Chose an
**additive solid tab** over a cut-in notch so it degrades gracefully (no thin interior
detail to muddy) at favicon / Windows-taskbar sizes; frame stroke (74) and play head
left untouched, so the tab reads as an accent, not a rival. To honour bbox-centring, the
whole mark group is translated **+25y** (the tab extends the vbbox upward); recompute
gives vbbox 184–840, centre 512, symmetric 184/184 margins; hbbox unchanged (frame
dominates, centre 512). The frame sitting marginally low also optically balances the
added top weight.
**Files changed:** `src/icon.svg` (added `transform="translate(0 25)"` to `#primary-mark`
+ tab rect); `src/logo.svg`, `src/logo-dark.svg`, `src/logo-horizontal.svg`,
`src/logo-horizontal-dark.svg`, `src/banner-og.svg`, `src/banner-github.svg` (wrapped the
embedded frame+playhead in `<g translate(0 25)>` + tab rect; tile bg rects unchanged).
**Re-exported:** app-icon, logo, logo-dark, logo-horizontal, logo-horizontal-dark,
og-banner, github-banner; plus the mark-bearing platform bundles (windows, macos, linux)
so the taskbar/dock icons stay consistent.
**Verify:** icon-1024 — tab reads cleanly as a trim handle on the top rail, centred,
geometric, doesn't overpower the play head; geometric bbox confirmed centred (184/184).
icon-32 — frame, tab, play head all legible. icon-16 — frame + play head stay crisp, tab
softens to a faint top-centre thickening without muddying (frame stroke stays
substantial). Logo + banner lockups carry the tab identically; wordmark/tagline
unchanged.
