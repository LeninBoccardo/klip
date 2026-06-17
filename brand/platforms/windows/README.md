# Klip — Windows icon

`app.ico` is a multi-resolution icon (16, 24, 32, 48, 64, 128, 256 px).

- **Installer (NSIS / Inno Setup):** set `MUI_ICON` / `SetupIconFile` to app.ico.
- **Electron:** `win.setIcon('app.ico')`, or electron-builder `"icon": "app.ico"`.
- **Tauri:** add app.ico to `tauri.conf.json` → `bundle.icon`.
- **Win32:** reference app.ico as the executable's resource icon.
