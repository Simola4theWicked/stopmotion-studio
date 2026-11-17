import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../lib/theme';
import { Button } from './Button';

type Props = {
  visible: boolean;
  name: string;
  fps: number;
  onionSkin: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
  onChangeFps: (delta: number) => void;
  onToggleOnionSkin: (value: boolean) => void;
};

export function ProjectSettingsSheet(p: Props) {
  return (
    <Modal visible={p.visible} transparent animationType="slide" onRequestClose={p.onClose}>
      <Pressable style={styles.backdrop} onPress={p.onClose} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <Text style={styles.title}>Projekt-Einstellungen</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          defaultValue={p.name}
          placeholder="Projektname"
          placeholderTextColor={colors.muted}
          onEndEditing={(e) => {
            const name = e.nativeEvent.text.trim();
            if (name && name !== p.name) p.onRename(name);
          }}
        />

        <Text style={styles.label}>Standard-Geschwindigkeit (für Bilder ohne eigene Dauer)</Text>
        <View style={styles.row}>
          <Button label="−" onPress={() => p.onChangeFps(-1)} />
          <Text style={styles.value}>
            {p.fps} Bilder/s · {Math.round(1000 / p.fps)} ms je Bild
          </Text>
          <Button label="+" onPress={() => p.onChangeFps(1)} />
        </View>

        <View style={[styles.row, styles.between]}>
          <Text style={styles.text}>Zwiebelhaut (vorheriges Bild im Editor einblenden)</Text>
          <Switch
            value={p.onionSkin}
            onValueChange={p.onToggleOnionSkin}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>

        <Button label="Fertig" variant="primary" onPress={p.onClose} style={styles.done} />
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
  label: { color: colors.muted, fontSize: 13, marginTop: 6 },
  text: { color: colors.text, flex: 1 },
  value: { color: colors.text, flex: 1, textAlign: 'center', fontVariant: ['tabular-nums'] },
  input: {
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { justifyContent: 'space-between', marginTop: 6 },
  done: { marginTop: 10 },
});
