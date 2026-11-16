# Stop Motion Studio

Eine Stop-Motion-App für **Android und iOS**, gebaut mit [Expo](https://expo.dev) (SDK 58) und React Native.

## Funktionen

- **Projekte** anlegen, umbenennen und löschen (lange drücken in der Übersicht)
- **Fotos aufnehmen** mit der eingebauten Kamera – inkl. **Zwiebelhaut** (das letzte Bild wird halbtransparent über das Live-Bild gelegt, 0/25/40/60 %), Front-/Rückkamera
- **Bilder aus der Galerie importieren** – Mehrfachauswahl in der gewählten Reihenfolge, Einfügen hinter dem aktuell ausgewählten Bild
- **Filmstreifen-Editor**: Bilder verschieben (◀ ▶), duplizieren (für Pausen) und löschen
- **Anzeigedauer pro Bild**: jedes Bild kann eigens lange zu sehen sein (Schnellwahl 0,1 / 0,25 / 0,5 / 1 / 2 s, feinjustierbar per −/+, bis 10 s) – oder es gilt die Standard-Geschwindigkeit des Projekts (1–30 fps). Mit „Für alle übernehmen“ lässt sich eine Dauer auf alle Bilder anwenden.
- **Vorschau/Abspielen** mit den eingestellten Anzeigedauern
- **Export als MP4-Video** (H.264, bis 1280 px) und als **animiertes GIF** – jeweils mit der Anzeigedauer jedes Bildes, direkt in die Galerie oder über das Teilen-Menü

Alle Daten bleiben lokal auf dem Gerät (`Documents/projects/<id>/`).

## APK herunterladen (Android)

Bei jedem Push auf `main` baut GitHub Actions automatisch eine APK und veröffentlicht sie unter **[Releases](../../releases/latest)**.
APK auf dem Handy öffnen und die Installation aus unbekannten Quellen erlauben – fertig.

> Die APK ist mit dem Debug-Schlüssel signiert (reicht zum Installieren und Aktualisieren per Hand). Für den Play Store wird ein eigener Upload-Schlüssel bzw. EAS Build benötigt.

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

Zum schnellen Ausprobieren funktioniert auch **Expo Go** (QR-Code aus `npx expo start` scannen) – dort fehlt allerdings der MP4-Export, weil er ein eigenes natives Modul nutzt.

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
    exportVideo.ts      # MP4-Export (ruft das native Modul auf)
    types.ts, theme.ts
modules/frames-to-video/  # Lokales Expo-Modul: Einzelbilder → MP4
  android/…/FramesToVideoModule.kt   # MediaCodec + MediaMuxer
  ios/FramesToVideoModule.swift      # AVAssetWriter
.github/workflows/android-apk.yml    # baut die APK und erstellt das Release
```

## Ideen für später

- Ton/Musik unterlegen
- Intervall-Aufnahme (Timelapse) und Lautstärketasten als Auslöser
