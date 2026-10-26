import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AtlasIcon } from '@/components/atlas/icon';
import { Sheet } from '@/components/atlas/sheet';
import { AtlasColors as C } from '@/constants/theme';
import type { SavedExercise } from '@/lib/api';

const FILTERS = ['All', 'Push', 'Pull', 'Legs'] as const;
type Filter = (typeof FILTERS)[number];

type Props = {
  exercises: SavedExercise[] | null;
  error: string | null;
  top: number;
  onClose: () => void;
  /** Opens the mic with this exercise's name, to log it again. */
  onPick: (name: string) => void;
};

export function ExercisesSheet({ exercises, error, top, onClose, onPick }: Props) {
  const [filter, setFilter] = useState<Filter>('All');
  const shown = (exercises ?? []).filter((e) => filter === 'All' || e.category === filter.toLowerCase());

  return (
    <Sheet title="Saved exercises" top={top} onClose={onClose}>
      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const on = f === filter;
          return (
            <Pressable
              key={f}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(f)}
              style={[styles.chip, on ? styles.chipOn : styles.chipOff]}>
              <Text style={[styles.chipText, { color: on ? C.onAccent : C.text }]}>{f}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {!exercises &&
          (error ? <Text style={styles.secondary}>{error}</Text> : <ActivityIndicator color={C.textSecondary} />)}
        {exercises && shown.length === 0 && (
          <Text style={styles.secondary}>
            {exercises.length === 0
              ? 'No exercises saved yet. Tap the mic and tell Atlas what you lifted.'
              : `No ${filter} exercises saved yet.`}
          </Text>
        )}
        {shown.map((e) => (
          <Pressable
            key={e.exerciseId}
            accessibilityRole="button"
            accessibilityHint="Log this exercise again"
            onPress={() => onPick(e.name)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={styles.rowText}>
              <Text style={styles.name}>{e.name}</Text>
              <Text style={styles.secondary}>Last: {e.last}</Text>
            </View>
            <View style={styles.meta}>
              <Text style={styles.secondary}>{e.when}</Text>
              <AtlasIcon name="chevron" size={16} color={C.textSecondary} />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8, marginTop: -4 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  chipOn: { backgroundColor: C.text },
  chipOff: { borderWidth: 1, borderColor: C.borderStrong },
  chipText: { fontSize: 13, fontWeight: '600' },
  scroll: { flexShrink: 1 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: C.surface2,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pressed: { opacity: 0.8 },
  rowText: { gap: 2, flexShrink: 1 },
  name: { fontSize: 15, fontWeight: '500', color: C.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  secondary: { fontSize: 13, color: C.textSecondary },
});
