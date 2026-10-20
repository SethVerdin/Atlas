import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { AtlasIcon } from '@/components/atlas/icon';
import { AtlasColors as C } from '@/constants/theme';

type Props = { title: string; onClose: () => void; top: number; children: ReactNode };

/** Panel that slides up from the bottom bar, used by the Macros and Exercises buttons. */
export function Sheet({ title, onClose, top, children }: Props) {
  return (
    <Animated.View
      entering={SlideInDown.duration(220)}
      exiting={SlideOutDown.duration(180)}
      accessibilityLabel={title}
      style={[styles.sheet, { top }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={styles.close}>
          <AtlasIcon name="close" size={18} color={C.text} />
        </Pressable>
      </View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: C.border,
    padding: 20,
    gap: 20,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '600', color: C.text },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.bubble,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
