# Klip — macOS icon

- `AppIcon.icns` — drop into the app bundle (`Contents/Resources/`, referenced by
  `CFBundleIconFile`), or hand to Electron / Tauri.
- `AppIcon.iconset/` — the source PNGs; rebuild with
  `iconutil -c icns AppIcon.iconset` after edits.

The artwork is inset to ~80% with a soft shadow per the macOS template — it does not
bleed to the canvas edge.
