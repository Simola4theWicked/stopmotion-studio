import * as ImagePicker from 'expo-image-picker';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { exportGif } from '../../lib/exportGif';
import {
  deleteFrameFile,
  duplicateFrameFile,
  frameUri,
  importImage,
  loadProject,
  saveProject,
} from '../../lib/storage';
import { colors } from '../../lib/theme';
import type { Project } from '../../lib/types';

const MIN_FPS = 1;
const MAX_FPS = 30;

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playIndex, setPlayIndex] = useState(0);
  const [onionSkin, setOnionSkin] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const stripRef = useRef<FlatList>(null);

  // Projekt beim Öffnen und nach Rückkehr von der Kamera neu laden
  useFocusEffect(
    useCallback(() => {
      loadProject(id).then((p) => {
        if (!p) return router.back();
        setProject(p);
        setSelected((s) => Math.min(Math.max(s, 0), Math.max(p.frames.length - 1, 0)));
      });
    }, [id]),
  );

  const update = useCallback(async (next: Project) => {
    setProject(next);
    setProject(await saveProject(next));
  }, []);

  // Wiedergabe
  useEffect(() => {
    if (!playing || !project || project.frames.length === 0) return;
    const timer = setInterval(
      () => setPlayIndex((i) => (i + 1) % project.frames.length),
      1000 / project.fps,
    );
    return () => clearInterval(timer);
  }, [playing, project]);

  if (!project) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const frames = project.frames;
  const hasFrames = frames.length > 0;
  const current = playing ? frames[playIndex] : frames[selected];
  const previous = !playing && onionSkin && selected > 0 ? frames[selected - 1] : null;

  const selectFrame = (index: number) => {
    setPlaying(false);
    setSelected(index);
  };

  const togglePlay = () => {
    if (!hasFrames) return;
    setPlayIndex(0);
    setPlaying((p) => !p);
  };

  const changeFps = (delta: number) =>
    update({ ...project, fps: Math.min(MAX_FPS, Math.max(MIN_FPS, project.fps + delta)) });

  const addFromGallery = async () => {
    setPlaying(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 0,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    try {
      const added = [];
      for (let i = 0; i < result.assets.length; i++) {
        setBusy(`Importiere ${i + 1}/${result.assets.length} …`);
        const a = result.assets[i];
        added.push(await importImage(project.id, a.uri, a.width, a.height));
      }
      // hinter dem ausgewählten Bild einfügen
      const insertAt = hasFrames ? selected + 1 : 0;
      const nextFrames = [...frames.slice(0, insertAt), ...added, ...frames.slice(insertAt)];
      await update({ ...project, frames: nextFrames });
      setSelected(insertAt + added.length - 1);
    } catch (e) {
      Alert.alert('Import fehlgeschlagen', String(e));
    } finally {
      setBusy(null);
    }
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
    const copy = duplicateFrameFile(project.id, frames[selected]);
    const next = [...frames];
    next.splice(selected + 1, 0, copy);
    update({ ...project, frames: next });
    setSelected(selected + 1);
  };

  const deleteFrame = () => {
    if (!hasFrames) return;
    const frame = frames[selected];
    deleteFrameFile(project.id, frame);
    update({ ...project, frames: frames.filter((f) => f.id !== frame.id) });
    setSelected(Math.max(0, selected - 1));
  };

  const runExport = async (target: 'share' | 'gallery') => {
    setPlaying(false);
    try {
      if (target === 'gallery') {
        const perm = await requestPermissionsAsync(true);
        if (!perm.granted) {
          Alert.alert('Keine Berechtigung', 'Bitte erlaube den Zugriff auf deine Fotos.');
          return;
        }
      }
      setBusy('Erstelle GIF …');
      const file = await exportGif(project, {
        onProgress: (done, total) => setBusy(`Erstelle GIF … ${done}/${total}`),
      });
      if (target === 'gallery') {
        await Asset.create(file.uri);
        Alert.alert('Gespeichert', 'Das GIF liegt jetzt in deiner Galerie.');
      } else {
        await Sharing.shareAsync(file.uri, { mimeType: 'image/gif', UTI: 'com.compuserve.gif' });
      }
    } catch (e) {
      Alert.alert('Export fehlgeschlagen', String(e));
    } finally {
      setBusy(null);
    }
  };

  const onExport = () =>
    Alert.alert('Film exportieren', 'Als animiertes GIF exportieren:', [
      { text: 'In Galerie speichern', onPress: () => runExport('gallery') },
      { text: 'Teilen …', onPress: () => runExport('share') },
      { text: 'Abbrechen', style: 'cancel' },
    ]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: project.name }} />

      {/* Vorschau */}
      <View style={styles.preview}>
        {current ? (
          <>
            {previous && (
              <Image
                source={{ uri: frameUri(project.id, previous) }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
              />
            )}
            <Image
              source={{ uri: frameUri(project.id, current) }}
              style={[StyleSheet.absoluteFill, previous && { opacity: 0.6 }]}
              resizeMode="contain"
              fadeDuration={0}
            />
            <Text style={styles.counter}>
              {(playing ? playIndex : selected) + 1} / {frames.length}
            </Text>
          </>
        ) : (
          <Text style={styles.muted}>Füge dein erstes Bild hinzu 📸</Text>
        )}
      </View>

      {/* Filmstreifen */}
      <FlatList
        ref={stripRef}
        horizontal
        data={frames}
        keyExtractor={(f) => f.id}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <Pressable onPress={() => selectFrame(index)}>
            <Image
              source={{ uri: frameUri(project.id, item) }}
              style={[
                styles.stripThumb,
                index === (playing ? playIndex : selected) && styles.stripThumbActive,
              ]}
            />
            <Text style={styles.stripIndex}>{index + 1}</Text>
          </Pressable>
        )}
      />

      <ScrollView contentContainerStyle={styles.controls}>
        <TextInput
          style={styles.nameInput}
          defaultValue={project.name}
          placeholder="Projektname"
          placeholderTextColor={colors.muted}
          onEndEditing={(e) => {
            const name = e.nativeEvent.text.trim();
            if (name && name !== project.name) update({ ...project, name });
          }}
        />

        <View style={styles.row}>
          <Button
            label="📷 Kamera"
            variant="primary"
            style={styles.flex}
            onPress={() => {
              setPlaying(false);
              router.push(`/camera/${project.id}`);
            }}
          />
          <Button label="🖼️ Galerie" variant="primary" style={styles.flex} onPress={addFromGallery} />
        </View>

        <View style={styles.row}>
          <Button
            label={playing ? '⏹ Stopp' : '▶️ Abspielen'}
            style={styles.flex}
            disabled={!hasFrames}
            onPress={togglePlay}
          />
          <View style={styles.fpsBox}>
            <Button small label="−" onPress={() => changeFps(-1)} />
            <Text style={styles.fpsText}>{project.fps} fps</Text>
            <Button small label="+" onPress={() => changeFps(1)} />
          </View>
        </View>

        <View style={styles.row}>
          <Button small label="◀" style={styles.flex} disabled={selected === 0} onPress={() => moveFrame(-1)} />
          <Button
            small
            label="▶"
            style={styles.flex}
            disabled={selected >= frames.length - 1}
            onPress={() => moveFrame(1)}
          />
          <Button small label="Duplizieren" style={styles.flex} disabled={!hasFrames} onPress={duplicateFrame} />
          <Button small label="Löschen" variant="danger" style={styles.flex} disabled={!hasFrames} onPress={deleteFrame} />
        </View>

        <View style={[styles.row, styles.switchRow]}>
          <Text style={styles.label}>Zwiebelhaut (vorheriges Bild einblenden)</Text>
          <Switch
            value={onionSkin}
            onValueChange={setOnionSkin}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>

        <Button label="⬇️ Als GIF exportieren" disabled={!hasFrames} onPress={onExport} />
      </ScrollView>

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
  preview: {
    aspectRatio: 4 / 3,
    width: '100%',
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
  stripContent: { padding: 8, gap: 6 },
  stripThumb: {
    width: 64,
    height: 48,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
  },
  stripThumbActive: { borderColor: colors.accent },
  stripIndex: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 2 },
  controls: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  flex: { flex: 1 },
  fpsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
  },
  fpsText: { color: colors.text, minWidth: 52, textAlign: 'center', fontVariant: ['tabular-nums'] },
  switchRow: { justifyContent: 'space-between' },
  label: { color: colors.text, flex: 1 },
  muted: { color: colors.muted },
  nameInput: {
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
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
