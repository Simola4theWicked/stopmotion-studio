import { Image } from 'expo-image';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { ExportSheet, type ExportFormat, type ExportTarget } from '../../components/ExportSheet';
import { ProjectSettingsSheet } from '../../components/ProjectSettingsSheet';
import { exportGif } from '../../lib/exportGif';
import { exportVideo, isVideoExportAvailable } from '../../lib/exportVideo';
import {
  deleteFrameFile,
  duplicateFrameFile,
  frameUri,
  loadProject,
  saveProject,
} from '../../lib/storage';
import { colors } from '../../lib/theme';
import {
  formatSeconds,
  frameDuration,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  totalDuration,
  type Project,
} from '../../lib/types';

const MIN_FPS = 1;
const MAX_FPS = 30;
const DURATION_PRESETS = [100, 250, 500, 1000, 2000];
const THUMB_W = 64;
const THUMB_GAP = 6;
const PREFETCH_AHEAD = 6;

/** Schrittweite für −/+ abhängig von der aktuellen Dauer */
const durationStep = (ms: number) => (ms < 500 ? 50 : ms < 2000 ? 100 : 500);

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playIndex, setPlayIndex] = useState(0);
  const [onionSkin, setOnionSkin] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const stripRef = useRef<FlatList>(null);

  // Projekt beim Öffnen und nach Rückkehr von Kamera/Galerie neu laden
  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;
  useFocusEffect(
    useCallback(() => {
      loadProject(id).then((p) => {
        if (!p) return router.back();
        const prev = projectRef.current;
        // nach einem Import das zuletzt eingefügte Bild auswählen
        let lastNew = -1;
        if (prev && p.frames.length > prev.frames.length) {
          const prevIds = new Set(prev.frames.map((f) => f.id));
          p.frames.forEach((f, i) => {
            if (!prevIds.has(f.id)) lastNew = i;
          });
        }
        setProject(p);
        setSelected((s) =>
          lastNew >= 0 ? lastNew : Math.min(Math.max(s, 0), Math.max(p.frames.length - 1, 0)),
        );
      });
    }, [id]),
  );

  const update = useCallback(async (next: Project) => {
    setProject(next);
    setProject(await saveProject(next));
  }, []);

  // Wiedergabe: jedes Bild bleibt so lange stehen, wie seine Anzeigedauer vorgibt
  useEffect(() => {
    if (!playing || !project || project.frames.length === 0) return;
    const n = project.frames.length;
    const frame = project.frames[playIndex % n];
    // die nächsten Bilder vorab dekodieren, damit beim Wechsel nichts flackert
    const upcoming = [];
    for (let k = 1; k <= Math.min(PREFETCH_AHEAD, n - 1); k++) {
      upcoming.push(frameUri(project.id, project.frames[(playIndex + k) % n]));
    }
    if (upcoming.length) Image.prefetch(upcoming, 'memory').catch(() => {});
    const timer = setTimeout(() => setPlayIndex((i) => (i + 1) % n), frameDuration(project, frame));
    return () => clearTimeout(timer);
  }, [playing, playIndex, project]);

  const activeIndex = playing ? playIndex : selected;

  // Filmstreifen mitlaufen lassen
  useEffect(() => {
    if (!project || project.frames.length === 0) return;
    stripRef.current?.scrollToIndex({
      index: Math.min(activeIndex, project.frames.length - 1),
      viewPosition: 0.5,
      animated: !playing,
    });
  }, [activeIndex, playing, project]);

  if (!project) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const frames = project.frames;
  const hasFrames = frames.length > 0;
  const current = frames[activeIndex];
  const previous = !playing && onionSkin && selected > 0 ? frames[selected - 1] : null;
  const selectedFrame = frames[selected];

  const selectFrame = (index: number) => {
    setPlaying(false);
    setSelected(index);
  };

  const togglePlay = () => {
    if (!hasFrames) return;
    if (playing) {
      setPlaying(false);
      setSelected(playIndex);
      return;
    }
    const start = selected >= frames.length - 1 ? 0 : selected;
    Image.prefetch(
      frames.slice(start, start + PREFETCH_AHEAD).map((f) => frameUri(project.id, f)),
      'memory',
    ).catch(() => {});
    setPlayIndex(start);
    setPlaying(true);
  };

  const changeFps = (delta: number) =>
    update({ ...project, fps: Math.min(MAX_FPS, Math.max(MIN_FPS, project.fps + delta)) });

  const setDuration = (durationMs: number | undefined) => {
    if (!hasFrames) return;
    const clamped =
      durationMs === undefined
        ? undefined
        : Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(durationMs)));
    const next = frames.map((f, i) => (i === selected ? { ...f, durationMs: clamped } : f));
    update({ ...project, frames: next });
  };

  const stepDuration = (dir: -1 | 1) => {
    const ms = frameDuration(project, selectedFrame);
    setDuration(ms + dir * durationStep(dir < 0 ? ms - 1 : ms));
  };

  const applyDurationToAll = () => {
    if (!hasFrames) return;
    const durationMs = selectedFrame.durationMs;
    Alert.alert(
      'Für alle Bilder übernehmen?',
      durationMs === undefined
        ? 'Alle Bilder verwenden dann wieder die Standard-Geschwindigkeit.'
        : `Alle ${frames.length} Bilder werden ${formatSeconds(durationMs)} lang angezeigt.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Übernehmen',
          onPress: () => update({ ...project, frames: frames.map((f) => ({ ...f, durationMs })) }),
        },
      ],
    );
  };

  const openCamera = () => {
    setPlaying(false);
    router.push(`/camera/${project.id}`);
  };

  const openGallery = () => {
    setPlaying(false);
    router.push({
      pathname: '/picker/[id]',
      params: { id: project.id, at: String(hasFrames ? selected + 1 : 0) },
    });
  };

  const moveFrame = (delta: -1 | 1) => {
    const target = selected + delta;
    if (target < 0 || target >= frames.length) return;
    const next = [...frames];
    [next[selected], next[target]] = [next[target], next[selected]];
    update({ ...project, frames: next });
    setSelected(target);
  };

  const duplicateFrame = () => {
    if (!hasFrames) return;
    const copy = duplicateFrameFile(project.id, selectedFrame);
    const next = [...frames];
    next.splice(selected + 1, 0, copy);
    update({ ...project, frames: next });
    setSelected(selected + 1);
  };

  const deleteFrame = () => {
    if (!hasFrames) return;
    deleteFrameFile(project.id, selectedFrame);
    update({ ...project, frames: frames.filter((f) => f.id !== selectedFrame.id) });
    setSelected(Math.max(0, selected - 1));
  };

  const openExport = () => {
    if (playing) togglePlay();
    setExportOpen(true);
  };

  const runExport = async (format: ExportFormat, target: ExportTarget) => {
    setPlaying(false);
    const label = format === 'mp4' ? 'Video' : 'GIF';
    try {
      if (target === 'gallery') {
        const perm = await requestPermissionsAsync(true);
        if (!perm.granted) {
          Alert.alert('Keine Berechtigung', 'Bitte erlaube den Zugriff auf deine Fotos.');
          return;
        }
      }
      setBusy(`Erstelle ${label} …`);
      const onProgress = (done: number, total: number) =>
        setBusy(`Erstelle ${label} … ${done}/${total}`);
      const file =
        format === 'mp4'
          ? await exportVideo(project, { onProgress })
          : await exportGif(project, { onProgress });
      if (target === 'gallery') {
        await Asset.create(file.uri);
        Alert.alert('Gespeichert', `Das ${label} liegt jetzt in deiner Galerie.`);
      } else if (format === 'mp4') {
        await Sharing.shareAsync(file.uri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
      } else {
        await Sharing.shareAsync(file.uri, { mimeType: 'image/gif', UTI: 'com.compuserve.gif' });
      }
    } catch (e) {
      Alert.alert('Export fehlgeschlagen', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: project.name,
          headerRight: () => (
            <Pressable onPress={() => setSettingsOpen(true)} hitSlop={12}>
              <Text style={styles.headerButton}>⚙︎</Text>
            </Pressable>
          ),
        }}
      />

      {/* Vorschau – füllt den freien Platz */}
      <Pressable style={styles.preview} onPress={togglePlay}>
        {current ? (
          <>
            {previous && (
              <Image
                source={{ uri: frameUri(project.id, previous) }}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                transition={0}
              />
            )}
            <Image
              source={{ uri: frameUri(project.id, current) }}
              style={[StyleSheet.absoluteFill, previous && { opacity: 0.6 }]}
              contentFit="contain"
              transition={0}
              cachePolicy="memory"
              priority="high"
            />
            <Text style={styles.counter}>
              {activeIndex + 1} / {frames.length} · {formatSeconds(totalDuration(project))}
            </Text>
          </>
        ) : (
          <Text style={styles.muted}>Füge dein erstes Bild hinzu 📸</Text>
        )}
      </Pressable>

      {/* Filmstreifen */}
      <FlatList
        ref={stripRef}
        horizontal
        data={frames}
        keyExtractor={(f) => f.id}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: THUMB_W + THUMB_GAP,
          offset: 8 + (THUMB_W + THUMB_GAP) * index,
          index,
        })}
        initialNumToRender={12}
        windowSize={5}
        onScrollToIndexFailed={() => {}}
        renderItem={({ item, index }) => (
          <Pressable onPress={() => selectFrame(index)} style={styles.stripItem}>
            <Image
              source={{ uri: frameUri(project.id, item) }}
              style={[styles.stripThumb, index === activeIndex && styles.stripThumbActive]}
              contentFit="cover"
              recyclingKey={item.id}
              transition={0}
            />
            <Text
              style={[styles.stripIndex, item.durationMs !== undefined && styles.stripCustom]}
              numberOfLines={1}
            >
              {item.durationMs !== undefined ? formatSeconds(item.durationMs) : index + 1}
            </Text>
          </Pressable>
        )}
      />

      {/* Bild bearbeiten (nur im Stand) */}
      {hasFrames && !playing && selectedFrame && (
        <View style={styles.panel}>
          <View style={styles.row}>
            <Text style={styles.label} numberOfLines={1}>
              Bild {selected + 1}:{' '}
              <Text style={styles.bold}>{formatSeconds(frameDuration(project, selectedFrame))}</Text>
              {selectedFrame.durationMs === undefined && <Text style={styles.small}> Std.</Text>}
            </Text>
            <Button small label="−" onPress={() => stepDuration(-1)} />
            <Button small label="+" onPress={() => stepDuration(1)} />
            <View style={styles.divider} />
            <Button small label="◀" disabled={selected === 0} onPress={() => moveFrame(-1)} />
            <Button small label="▶" disabled={selected >= frames.length - 1} onPress={() => moveFrame(1)} />
            <Button small label="⧉" onPress={duplicateFrame} />
            <Button small label="🗑" variant="danger" onPress={deleteFrame} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {DURATION_PRESETS.map((ms) => (
              <Button
                key={ms}
                small
                label={formatSeconds(ms)}
                style={selectedFrame.durationMs === ms ? styles.presetActive : undefined}
                onPress={() => setDuration(ms)}
              />
            ))}
            <Button
              small
              label="Standard"
              disabled={selectedFrame.durationMs === undefined}
              onPress={() => setDuration(undefined)}
            />
            <Button small label="Für alle übernehmen" onPress={applyDurationToAll} />
          </ScrollView>
        </View>
      )}

      {/* Aktionsleiste – immer sichtbar */}
      <View style={styles.bottomBar}>
        <Button label="📷 Kamera" style={styles.flex} onPress={openCamera} />
        <Button label="🖼️ Galerie" style={styles.flex} onPress={openGallery} />
        <Button
          label={playing ? '⏹' : '▶️'}
          variant="primary"
          style={styles.play}
          disabled={!hasFrames}
          onPress={togglePlay}
        />
        <Button label="⬇️ Export" style={styles.flex} disabled={!hasFrames} onPress={openExport} />
      </View>

      <ExportSheet
        visible={exportOpen}
        videoAvailable={isVideoExportAvailable()}
        onClose={() => setExportOpen(false)}
        onSelect={runExport}
      />

      <ProjectSettingsSheet
        visible={settingsOpen}
        name={project.name}
        fps={project.fps}
        onionSkin={onionSkin}
        onClose={() => setSettingsOpen(false)}
        onRename={(name) => update({ ...project, name })}
        onChangeFps={changeFps}
        onToggleOnionSkin={setOnionSkin}
      />

      {busy && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.overlayText}>{busy}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  headerButton: { color: colors.text, fontSize: 22, paddingHorizontal: 8 },
  preview: {
    flex: 1,
    minHeight: 160,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    right: 10,
    bottom: 8,
    color: colors.text,
    backgroundColor: '#0008',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    fontVariant: ['tabular-nums'],
  },
  strip: { flexGrow: 0, backgroundColor: colors.surface },
  stripContent: { padding: 8 },
  stripItem: { width: THUMB_W + THUMB_GAP, paddingRight: THUMB_GAP },
  stripThumb: {
    width: THUMB_W,
    height: 48,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
  },
  stripThumbActive: { borderColor: colors.accent },
  stripIndex: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 2 },
  stripCustom: { color: colors.accent, fontWeight: '600' },
  panel: { paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  chips: { gap: 6 },
  divider: { width: 1, height: 24, backgroundColor: colors.border, marginHorizontal: 2 },
  presetActive: { backgroundColor: colors.accent },
  label: { color: colors.text, flex: 1 },
  bold: { fontWeight: '700' },
  small: { color: colors.muted, fontSize: 11 },
  muted: { color: colors.muted },
  flex: { flex: 1 },
  play: { width: 64 },
  bottomBar: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 10,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  overlayText: { color: colors.text, fontSize: 16 },
});
