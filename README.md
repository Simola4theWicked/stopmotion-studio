# Stop Motion Studio

Eine Stop-Motion-App für **Android und iOS**, gebaut mit [Expo](https://expo.dev) (SDK 58) und React Native.

## Funktionen

- **Projekte** anlegen, umbenennen und löschen (lange drücken in der Übersicht)
- **Fotos aufnehmen** mit der eingebauten Kamera – inkl. **Zwiebelhaut** (das letzte Bild wird halbtransparent über das Live-Bild gelegt, 0/25/40/60 %), Front-/Rückkamera
- **Bilder aus der Galerie importieren** – Mehrfachauswahl in der gewählten Reihenfolge, Einfügen hinter dem aktuell ausgewählten Bild
- **Filmstreifen-Editor**: Bilder verschieben (◀ ▶), duplizieren (für Pausen) und löschen
- **Vorschau/Abspielen** mit einstellbarer Geschwindigkeit (1–30 fps)
- **Export als animiertes GIF** – direkt in die Galerie speichern oder über das Teilen-Menü versenden

Alle Daten bleiben lokal auf dem Gerät (`Documents/projects/<id>/`).

## Entwickeln

```bash
npm install
npx expo start
```

Da die App native Module (Kamera, Medienbibliothek) nutzt, empfiehlt sich ein **Development Build**:

```bash
npx expo run:android      # lokal, benötigt Android Studio
npx expo run:ios          # lokal, benötigt macOS + Xcode
# oder in der Cloud mit EAS:
npx eas-cli@latest build --profile development --platform all
```

Zum schnellen Ausprobieren funktioniert meist auch **Expo Go** (QR-Code aus `npx expo start` scannen).

## Bauen & Veröffentlichen

```bash
npx eas-cli@latest build --profile preview --platform android   # installierbare APK
npx eas-cli@latest build --profile production --platform all     # Store-Builds
npx eas-cli@latest submit --platform all
```

Vor dem Store-Release `ios.bundleIdentifier` und `android.package` in `app.json` (aktuell `de.example.stopmotion`) auf eine eigene ID ändern.

## Projektstruktur

```
src/
  app/                  # Screens (Expo Router)
    index.tsx           # Projektübersicht
    project/[id].tsx    # Editor: Vorschau, Filmstreifen, Abspielen, Export
    camera/[id].tsx     # Kamera mit Zwiebelhaut
  components/Button.tsx
  lib/
    storage.ts          # Projekte & Frames im Dateisystem
    exportGif.ts        # GIF-Encoder (gifenc + jpeg-js)
    types.ts, theme.ts
```

## Ideen für später

- Export als MP4-Video (benötigt ein natives Video-Encoding-Modul)
- Ton/Musik unterlegen
- Intervall-Aufnahme (Timelapse) und Lautstärketasten als Auslöser
- Einzelbild-Dauer pro Frame
