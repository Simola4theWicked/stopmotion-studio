import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { importImage, loadProject, saveProject } from '../../lib/storage';
import { colors } from '../../lib/theme';
import type { Frame } from '../../lib/types';

const PAGE_SIZE = 500;
const COLUMNS = 4;
const ALL = '__all__';

type Order = 'time' | 'tap';

/**
 * Eigene Galerie-Auswahl ohne die 100-Bilder-Grenze des System-Pickers.
 * Tippen wählt einzelne Bilder, langes Drücken wählt einen ganzen Bereich.
 */
export default function PickerScreen() {
  const { id, at } = useLocalSearchParams<{ id: string; at?: string }>();
  const { width } = useWindowDimensions();
  const tile = Math.floor(width / COLUMNS);

  const [permission, requestPermission] = MediaLibrary.usePermissions({
    granularPermissions: ['photo'],
  });
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [album, setAlbum] = useState<string>(ALL);
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursor = useRef<string | undefined>(undefined);
  const loadToken = useRef(0);

  // Auswahl: id -> Reihenfolge des Antippens
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const tapCounter = useRef(0);
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [order, setOrder] = useState<Order>('time');

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const granted = permission?.granted ?? false;

  useEffect(() => {
    if (!granted) return;
    MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true })
      .then((list) =>
        setAlbums(list.filter((a) => a.assetCount > 0).sort((a, b) => b.assetCount - a.assetCount)),
      )
      .catch(() => setAlbums([]));
  }, [granted]);

  const loadPage = useCallback(
    async (reset: boolean) => {
      const token = reset ? ++loadToken.current : loadToken.current;
      if (reset) cursor.current = undefined;
      setLoading(true);
      try {
        const page = await MediaLibrary.getAssetsAsync({
          first: PAGE_SIZE,
          after: cursor.current,
          album: album === ALL ? undefined : album,
          mediaType: MediaLibrary.MediaType.photo,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        if (token !== loadToken.current) return; // Album wurde inzwischen gewechselt
        cursor.current = page.endCursor;
        setHasMore(page.hasNextPage);
        setAssets((prev) => (reset ? page.assets : [...prev, ...page.assets]));
      } catch (e) {
        Alert.alert('Galerie nicht lesbar', String(e));
      } finally {
        if (token === loadToken.current) setLoading(false);
      }
    },
    [album],
  );

  useEffect(() => {
    if (!granted) return;
    setAssets([]);
    setRangeStart(null);
    loadPage(true);
  }, [granted, album, loadPage]);

  const toggle = (asset: MediaLibrary.Asset) => {
    setRangeStart(null);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(asset.id)) next.delete(asset.id);
      else next.set(asset.id, ++tapCounter.current);
      return next;
    });
  };

  const longPress = (index: number) => {
    if (rangeStart === null) {
      setRangeStart(index);
      setSelected((prev) => {
        const next = new Map(prev);
        if (!next.has(assets[index].id)) next.set(assets[index].id, ++tapCounter.current);
        return next;
      });
      return;
    }
    const [from, to] = rangeStart < index ? [rangeStart, index] : [index, rangeStart];
    // Bereich in Aufnahmereihenfolge (älteste zuerst) markieren
    setSelected((prev) => {
      const next = new Map(prev);
      for (let i = to; i >= from; i--) {
        if (!next.has(assets[i].id)) next.set(assets[i].id, ++tapCounter.current);
      }
      return next;
    });
    setRangeStart(null);
  };

  const allLoadedSelected = assets.length > 0 && assets.every((a) => selected.has(a.id));

  const toggleAll = () => {
    setRangeStart(null);
    setSelected((prev) => {
      const next = new Map(prev);
      if (allLoadedSelected) {
        assets.forEach((a) => next.delete(a.id));
      } else {
        for (let i = assets.length - 1; i >= 0; i--) {
          if (!next.has(assets[i].id)) next.set(assets[i].id, ++tapCounter.current);
        }
      }
      return next;
    });
  };

  const loadEverything = async () => {
    // weitere Seiten nachladen, damit "Alle" wirklich alle erfasst
    if (loading) return;
    setLoading(true);
    const token = loadToken.current;
    try {
    while (cursor.current && token === loadToken.current) {
      const page = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE,
        after: cursor.current,
        album: album === ALL ? undefined : album,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      if (token !== loadToken.current) break;
      cursor.current = page.endCursor;
      setHasMore(page.hasNextPage);
      setAssets((prev) => [...prev, ...page.assets]);
      if (!page.hasNextPage) break;
    }
    } finally {
      setLoading(false);
    }
  };

  const assetById = useMemo(() => {
    const map = new Map<string, MediaLibrary.Asset>();
    assets.forEach((a) => map.set(a.id, a));
    return map;
  }, [assets]);

  const runImport = async () => {
    const project = await loadProject(id);
    if (!project) return router.back();

    const chosen = [...selected.entries()]
      .map(([assetId, tap]) => ({ asset: assetById.get(assetId), tap }))
      .filter((x): x is { asset: MediaLibrary.Asset; tap: number } => !!x.asset)
      .sort((a, b) =>
        order === 'tap'
          ? a.tap - b.tap
          : a.asset.creationTime - b.asset.creationTime || a.asset.filename.localeCompare(b.asset.filename),
      )
      .map((x) => x.asset);
    if (chosen.length === 0) return;

    cancelled.current = false;
    setProgress({ done: 0, total: chosen.length });
    const added: Frame[] = [];
    try {
      for (let i = 0; i < chosen.length; i++) {
        if (cancelled.current) break;
        const asset = chosen[i];
        let uri = asset.uri;
        if (Platform.OS === 'ios') {
          const info = await MediaLibrary.getAssetInfoAsync(asset);
          uri = info.localUri ?? asset.uri;
        }
        added.push(await importImage(id, uri, asset.width, asset.height));
        setProgress({ done: i + 1, total: chosen.length });
      }
    } catch (e) {
      Alert.alert('Import abgebrochen', `Fehler bei Bild ${added.length + 1}: ${String(e)}`);
    }

    if (added.length > 0) {
      const latest = (await loadProject(id)) ?? project;
      const insertAt = Math.min(Math.max(Number(at ?? latest.frames.length), 0), latest.frames.length);
      await saveProject({
        ...latest,
        frames: [...latest.frames.slice(0, insertAt), ...added, ...latest.frames.slice(insertAt)],
      });
    }
    setProgress(null);
    router.back();
  };

  if (!permission) return <View style={styles.container} />;

  if (!granted) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Text style={styles.text}>Bitte erlaube den Zugriff auf deine Fotos.</Text>
        <Button label="Zugriff erlauben" variant="primary" onPress={requestPermission} />
        <Button label="Zurück" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const albumChips = [{ id: ALL, title: 'Alle Fotos' }, ...albums];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Bilder auswählen' }} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.albumBar} contentContainerStyle={styles.albumBarContent}>
        {albumChips.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => setAlbum(a.id)}
            style={[styles.chip, album === a.id && styles.chipActive]}
          >
            <Text style={styles.chipText} numberOfLines={1}>
              {a.title}
              {'assetCount' in a ? ` · ${a.assetCount}` : ''}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.hint}>
        {rangeStart !== null
          ? 'Bereich: jetzt das letzte Bild lange drücken'
          : 'Tippen = einzeln · lange drücken = Bereich von … bis'}
      </Text>

      <FlatList
        data={assets}
        keyExtractor={(a) => a.id}
        numColumns={COLUMNS}
        onEndReached={() => hasMore && !loading && loadPage(false)}
        onEndReachedThreshold={1.5}
        getItemLayout={(_, index) => ({
          length: tile,
          offset: tile * Math.floor(index / COLUMNS),
          index,
        })}
        initialNumToRender={COLUMNS * 8}
        windowSize={7}
        ListFooterComponent={loading ? <ActivityIndicator color={colors.accent} style={{ margin: 16 }} /> : undefined}
        ListEmptyComponent={!loading ? <Text style={[styles.text, { margin: 24 }]}>Keine Fotos gefunden.</Text> : undefined}
        renderItem={({ item, index }) => {
          const isSelected = selected.has(item.id);
          return (
            <Pressable
              onPress={() => toggle(item)}
              onLongPress={() => longPress(index)}
              style={{ width: tile, height: tile, padding: 1 }}
            >
              <Image
                source={{ uri: item.uri }}
                style={styles.fill}
                contentFit="cover"
                recyclingKey={item.id}
                transition={0}
              />
              {isSelected && <View style={styles.selectedOverlay} />}
              {isSelected && (
                <View style={styles.check}>
                  <Text style={styles.checkText}>✓</Text>
                </View>
              )}
              {rangeStart === index && <View style={styles.rangeStart} />}
            </Pressable>
          );
        }}
      />

      <View style={styles.bottom}>
        <View style={styles.row}>
          <Button small label={allLoadedSelected ? 'Keine' : 'Alle'} onPress={toggleAll} style={styles.flex} />
          {hasMore && <Button small label="Alle laden" onPress={loadEverything} style={styles.flex} />}
          <Button
            small
            label={order === 'time' ? 'Reihenfolge: Aufnahmezeit' : 'Reihenfolge: Antippen'}
            onPress={() => setOrder((o) => (o === 'time' ? 'tap' : 'time'))}
            style={styles.flex2}
          />
        </View>
        <Button
          label={selected.size > 0 ? `${selected.size} Bilder importieren` : 'Bilder auswählen'}
          variant="primary"
          disabled={selected.size === 0}
          onPress={runImport}
        />
      </View>

      {progress && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.text}>
            Importiere {progress.done} / {progress.total} …
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${(progress.done / progress.total) * 100}%` }]} />
          </View>
          <Button label="Abbrechen (bisherige behalten)" onPress={() => (cancelled.current = true)} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  text: { color: colors.text, fontSize: 16, textAlign: 'center' },
  fill: { flex: 1, backgroundColor: colors.surfaceAlt },
  albumBar: { flexGrow: 0 },
  albumBarContent: { padding: 8, gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.surface,
    maxWidth: 220,
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13 },
  hint: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingBottom: 6 },
  selectedOverlay: { ...StyleSheet.absoluteFill, margin: 1, backgroundColor: colors.accentSoft, borderWidth: 3, borderColor: colors.accent },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rangeStart: { ...StyleSheet.absoluteFill, margin: 1, borderWidth: 3, borderColor: '#fff', borderStyle: 'dashed' },
  bottom: { padding: 12, gap: 8, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  flex2: { flex: 2 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000c',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  progressTrack: { width: '100%', height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
});
