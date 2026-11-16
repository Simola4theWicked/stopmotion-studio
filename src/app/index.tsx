import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { createProject, deleteProject, frameUri, listProjects } from '../lib/storage';
import { colors } from '../lib/theme';
import type { Project } from '../lib/types';

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([]);

  const refresh = useCallback(() => {
    listProjects().then(setProjects).catch((e) => Alert.alert('Fehler', String(e)));
  }, []);

  useFocusEffect(refresh);

  const onCreate = async () => {
    const project = await createProject(`Film ${projects.length + 1}`);
    router.push(`/project/${project.id}`);
  };

  const onDelete = (project: Project) => {
    Alert.alert('Projekt löschen?', `„${project.name}“ und alle Bilder werden gelöscht.`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          deleteProject(project.id);
          refresh();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Noch keine Filme</Text>
            <Text style={styles.emptyText}>
              Lege ein neues Projekt an und füge Fotos aus der Galerie hinzu oder nimm sie direkt
              mit der Kamera auf.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
            onPress={() => router.push(`/project/${item.id}`)}
            onLongPress={() => onDelete(item)}
          >
            {item.frames[0] ? (
              <Image source={{ uri: frameUri(item.id, item.frames[0]) }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Text style={styles.muted}>leer</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.muted}>
                {item.frames.length} Bilder · {item.fps} fps ·{' '}
                {(item.frames.length / item.fps).toFixed(1)} s
              </Text>
            </View>
          </Pressable>
        )}
      />
      <View style={styles.footer}>
        <Button label="+ Neues Projekt" variant="primary" onPress={onCreate} />
        {projects.length > 0 && (
          <Text style={[styles.muted, styles.hint]}>Lange drücken zum Löschen</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 10,
  },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: 4 },
  muted: { color: colors.muted, fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
  footer: { padding: 16 },
  hint: { textAlign: 'center', marginTop: 8 },
});
