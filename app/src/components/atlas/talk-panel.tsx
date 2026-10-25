import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { AtlasColors as C } from '@/constants/theme';

const WAVE = [10, 18, 28, 16, 34, 24, 12, 30, 38, 22, 14, 26, 36, 20, 10, 24, 32, 18, 28, 12, 22, 34, 16, 26, 14, 20, 10, 8];

type Props = { transcript: string; onCancel: () => void; onSend: () => void };

/**
 * Shown while the center button is listening. Speech capture isn't wired up
 * yet, so the transcript is passed in.
 */
export function TalkPanel({ transcript, onCancel, onSend }: Props) {
  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(160)}
      accessibilityLabel="Talking to Atlas"
      style={styles.panel}>
      <View style={styles.status}>
        <View style={styles.dot} />
        <Text style={styles.statusText}>LISTENING</Text>
      </View>
      <Text style={styles.transcript}>“{transcript}”</Text>
      <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {WAVE.map((h, i) => (
          <View key={i} style={[styles.waveBar, { height: h }]} />
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.button, styles.secondary]}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onSend} style={[styles.button, styles.primary]}>
          <Text style={styles.primaryText}>Send</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  statusText: { fontSize: 13, fontWeight: '600', letterSpacing: 1, color: C.accent },
  transcript: { fontSize: 19, lineHeight: 27, fontWeight: '500', color: C.text },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, overflow: 'hidden' },
  waveBar: { width: 4, borderRadius: 2, backgroundColor: C.accent },
  actions: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondary: { borderWidth: 1, borderColor: C.borderStrong },
  secondaryText: { fontSize: 15, fontWeight: '600', color: C.text },
  primary: { backgroundColor: C.accent },
  primaryText: { fontSize: 15, fontWeight: '600', color: C.onAccent },
});
