import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AtlasIcon, type AtlasIconName } from '@/components/atlas/icon';
import { AtlasColors as C } from '@/constants/theme';

export type Panel = 'macros' | 'talk' | 'exercises';

/** Height of the bar above the bottom safe-area inset. */
export const BOTTOM_BAR_HEIGHT = 120;

type Props = {
  active: Panel | null;
  onPress: (panel: Panel) => void;
  bottomInset: number;
};

/** Wireframe layout: Macros square · talk circle · Exercises square. */
export function BottomBar({ active, onPress, bottomInset }: Props) {
  return (
    <View style={[styles.bar, { height: BOTTOM_BAR_HEIGHT + bottomInset, paddingBottom: bottomInset }]}>
      <View style={[styles.cell, styles.divider]}>
        <NavButton
          label="Macros"
          icon="macros"
          active={active === 'macros'}
          onPress={() => onPress('macros')}
        />
      </View>
      <View style={styles.cell}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Talk to Atlas"
          accessibilityState={{ selected: active === 'talk' }}
          onPress={() => onPress('talk')}
          style={({ pressed }) => [
            styles.mic,
            active === 'talk' ? styles.micListening : styles.micIdle,
            pressed && styles.pressed,
          ]}>
          <AtlasIcon name="mic" size={34} color={C.onAccent} />
        </Pressable>
      </View>
      <View style={[styles.cell, styles.divider]}>
        <NavButton
          label="Exercises"
          icon="exercises"
          active={active === 'exercises'}
          onPress={() => onPress('exercises')}
        />
      </View>
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
      <AtlasIcon name={icon} size={26} color={color} />
      <Text style={[styles.navLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    backgroundColor: C.bg,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    borderTopWidth: 2,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  navButton: {
    width: 84,
    height: 84,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  navButtonIdle: {
    backgroundColor: C.nav,
    borderWidth: 1,
    borderColor: C.border,
  },
  navButtonActive: {
    backgroundColor: C.accent,
  },
  navLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  mic: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginTop: -6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  micIdle: {
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.5)',
  },
  micListening: {
    boxShadow: '0 0 0 10px rgba(198, 242, 78, 0.22)',
  },
  pressed: {
    opacity: 0.85,
  },
});
