# Klip — Linux icons

Install the icon theme files into a search path and refresh the cache:

    cp -r hicolor/* ~/.local/share/icons/hicolor/            # per-user
    # or system-wide:  sudo cp -r hicolor/* /usr/share/icons/hicolor/
    gtk-update-icon-cache ~/.local/share/icons/hicolor/

Install the launcher (set `Exec=` to your binary first):

    cp klip.desktop ~/.local/share/applications/
    update-desktop-database ~/.local/share/applications/

`Icon=klip` resolves by name to the installed PNG/SVG; `Exec=klip` is a
placeholder you replace with your executable's path or command.
