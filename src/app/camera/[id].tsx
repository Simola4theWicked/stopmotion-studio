import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { frameUri, importImage, loadProject, saveProject } from '../../lib/storage';
import { colors } from '../../lib/theme';
import type { Project } from '../../lib/types';

const ONION_LEVELS = [0, 0.25, 0.4, 0.6];

export default function CameraScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [project, setProject] = useState<Project | null>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [onionLevel, setOnionLevel] = useState(2);
  const [capturing, setCapturing] = useState(false);
  const [ready, setReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    loadProject(id).then(setProject);
  }, [id]);

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Text style={styles.text}>Für Aufnahmen braucht die App Zugriff auf deine Kamera.</Text>
        <Button label="Zugriff erlauben" variant="primary" onPress={requestPermission} />
        <Button label="Zurück" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const lastFrame = project?.frames[project.frames.length - 1];
  const opacity = ONION_LEVELS[onionLevel];

  const capture = async () => {
    if (!cameraRef.current || !project || capturing || !ready) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, shutterSound: false });
      const frame = await importImage(project.id, photo.uri, photo.width, photo.height);
      setProject(await saveProject({ ...project, frames: [...project.frames, frame] }));
    } catch (e) {
      Alert.alert('Aufnahme fehlgeschlagen', String(e));
    } finally {
      setCapturing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.cameraWrap}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="picture"
          animateShutter
          onCameraReady={() => setReady(true)}
        />
        {/* Zwiebelhaut: letztes Bild halbtransparent über dem Live-Bild */}
        {lastFrame && opacity > 0 && project && (
          <Image
            source={{ uri: frameUri(project.id, lastFrame) }}
            style={[StyleSheet.absoluteFill, { opacity }]}
            resizeMode="cover"
            pointerEvents="none"
          />
        )}
      </View>

      <SafeAreaView style={styles.topBar} edges={['top']}>
        <Button small label="✕ Fertig" onPress={() => router.back()} />
        <Text style={styles.badge}>{project?.frames.length ?? 0} Bilder</Text>
        <Button
          small
          label="🔄"
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
        />
      </SafeAreaView>

      <SafeAreaView style={styles.bottomBar} edges={['bottom']}>
        <Pressable
          style={styles.thumbBox}
          onPress={() => setOnionLevel((l) => (l + 1) % ONION_LEVELS.length)}
        >
          <Text style={styles.small}>Zwiebelhaut</Text>
          <Text style={styles.text}>{Math.round(opacity * 100)} %</Text>
        </Pressable>

        <Pressable
          accessibilityLabel="Foto aufnehmen"
          onPress={capture}
          disabled={capturing || !ready}
          style={({ pressed }) => [styles.shutter, (pressed || capturing) && { opacity: 0.6 }]}
        >
          <View style={styles.shutterInner} />
        </Pressable>

        <View style={styles.thumbBox}>
          {lastFrame && project ? (
            <Image source={{ uri: frameUri(project.id, lastFrame) }} style={styles.thumb} />
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  cameraWrap: { flex: 1 },
  text: { color: colors.text, fontSize: 16, textAlign: 'center' },
  small: { color: colors.muted, fontSize: 11 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  badge: {
    color: colors.text,
    backgroundColor: '#0009',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 16,
    backgroundColor: '#000',
  },
  thumbBox: { width: 80, height: 64, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 64, height: 64, borderRadius: 8 },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.accent },
});
