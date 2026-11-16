import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../lib/theme';
import { Button } from './Button';

export type ExportFormat = 'mp4' | 'gif';
export type ExportTarget = 'gallery' | 'share';

type Props = {
  visible: boolean;
  videoAvailable: boolean;
  onClose: () => void;
  onSelect: (format: ExportFormat, target: ExportTarget) => void;
};

export function ExportSheet({ visible, videoAvailable, onClose, onSelect }: Props) {
  const choose = (format: ExportFormat, target: ExportTarget) => {
    onClose();
    onSelect(format, target);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <Text style={styles.title}>Film exportieren</Text>

        <Text style={styles.section}>🎬 Video (MP4)</Text>
        {videoAvailable ? (
          <View style={styles.row}>
            <Button label="In Galerie speichern" variant="primary" style={styles.flex} onPress={() => choose('mp4', 'gallery')} />
            <Button label="Teilen …" variant="primary" style={styles.flex} onPress={() => choose('mp4', 'share')} />
          </View>
        ) : (
          <Text style={styles.hint}>
            Der MP4-Export ist nur in der installierten App verfügbar (nicht in Expo Go).
          </Text>
        )}

        <Text style={styles.section}>🖼️ Animiertes GIF</Text>
        <View style={styles.row}>
          <Button label="In Galerie speichern" style={styles.flex} onPress={() => choose('gif', 'gallery')} />
          <Button label="Teilen …" style={styles.flex} onPress={() => choose('gif', 'share')} />
        </View>

        <Button label="Abbrechen" style={styles.cancel} onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 10,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  section: { color: colors.muted, fontSize: 13, marginTop: 6 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  cancel: { marginTop: 8 },
});
