import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AtlasIcon, type AtlasIconName } from '@/components/atlas/icon';
import { AtlasColors as C } from '@/constants/theme';

export type Panel = 'macros' | 'exercises';

type Props = {
  active: Panel | null;
  onPress: (panel: Panel) => void;
};

/** Slim row under the composer: Macros · Exercises. */
export function BottomBar({ active, onPress }: Props) {
  return (
    <View style={styles.bar}>
      <NavButton label="Macros" icon="macros" active={active === 'macros'} onPress={() => onPress('macros')} />
      <NavButton label="Exercises" icon="exercises" active={active === 'exercises'} onPress={() => onPress('exercises')} />
    </View>
  );
}

type NavButtonProps = { label: string; icon: AtlasIconName; active: boolean; onPress: () => void };

function NavButton({ label, icon, active, onPress }: NavButtonProps) {
  const color = active ? C.onAccent : C.textBody;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navButton,
        active ? styles.navButtonActive : styles.navButtonIdle,
        pressed && styles.pressed,
      ]}>
      <AtlasIcon name={icon} size={20} color={color} />
      <Text style={[styles.navLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 10 },
  navButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  navButtonIdle: { backgroundColor: C.nav, borderWidth: 1, borderColor: C.border },
  navButtonActive: { backgroundColor: C.accent },
  navLabel: { fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});
