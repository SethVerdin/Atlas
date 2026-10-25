import { StyleSheet, Text, View } from 'react-native';

import { Sheet } from '@/components/atlas/sheet';
import { AtlasColors as C } from '@/constants/theme';
import type { Macros } from '@/data/sample-day';

type Meal = { name: string; time: string; items: number; kcal: number };

type Props = {
  consumed: Macros;
  goals: Macros;
  meals: Meal[];
  top: number;
  onClose: () => void;
};

const share = (got: number, goal: number) => `${Math.min(100, (got / goal) * 100)}%` as const;

export function MacrosSheet({ consumed, goals, meals, top, onClose }: Props) {
  const left = Math.max(0, goals.kcal - consumed.kcal);
  const bars = [
    { label: 'Protein', got: consumed.protein_g, goal: goals.protein_g, color: C.accent },
    { label: 'Carbs', got: consumed.carbs_g, goal: goals.carbs_g, color: C.carbs },
    { label: 'Fat', got: consumed.fat_g, goal: goals.fat_g, color: C.fat },
  ];

  return (
    <Sheet title="Today's macros" top={top} onClose={onClose}>
      <View style={styles.gap10}>
        <View style={styles.calRow}>
          <View style={styles.calNumber}>
            <Text style={styles.kcalBig}>{consumed.kcal.toLocaleString()}</Text>
            <Text style={styles.secondary15}>/ {goals.kcal.toLocaleString()} kcal</Text>
          </View>
          <Text style={styles.secondary14}>{left.toLocaleString()} left</Text>
        </View>
        <View style={[styles.track, styles.trackTall]}>
          <View style={[styles.fill, { width: share(consumed.kcal, goals.kcal), backgroundColor: C.accent }]} />
        </View>
      </View>

      <View style={styles.gap14}>
        {bars.map((b) => (
          <View key={b.label} style={styles.gap6}>
            <View style={styles.rowBetween}>
              <Text style={styles.barLabel}>{b.label}</Text>
              <Text style={styles.secondary14}>
                {b.got} / {b.goal} g
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: share(b.got, b.goal), backgroundColor: b.color }]} />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.gap8}>
        <Text style={styles.sectionLabel}>MEALS</Text>
        {meals.map((m) => (
          <View key={m.name} style={[styles.rowBetween, styles.meal]}>
            <View style={styles.gap2}>
              <Text style={styles.mealName}>{m.name}</Text>
              <Text style={styles.secondary13}>
                {m.time} · {m.items} items
              </Text>
            </View>
            <Text style={styles.mealKcal}>{m.kcal} kcal</Text>
          </View>
        ))}
        <View style={[styles.rowBetween, styles.emptyMeal]}>
          <Text style={styles.secondary14}>Next meal not logged yet</Text>
          <Text style={styles.secondary13}>Tap the mic</Text>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  calRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  calNumber: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  kcalBig: { fontSize: 44, fontWeight: '700', letterSpacing: -1, color: C.text },
  track: { height: 8, borderRadius: 4, backgroundColor: C.bubble, overflow: 'hidden' },
  trackTall: { height: 10, borderRadius: 5 },
  fill: { height: '100%', borderRadius: 5 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barLabel: { fontSize: 14, fontWeight: '500', color: C.text },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 1, color: C.textSecondary },
  meal: { backgroundColor: C.surface2, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  mealName: { fontSize: 15, fontWeight: '500', color: C.text },
  mealKcal: { fontSize: 15, color: C.text },
  emptyMeal: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.borderStrong,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  secondary13: { fontSize: 13, color: C.textSecondary },
  secondary14: { fontSize: 14, color: C.textSecondary },
  secondary15: { fontSize: 15, color: C.textSecondary },
  gap2: { gap: 2 },
  gap6: { gap: 6 },
  gap8: { gap: 8 },
  gap10: { gap: 10 },
  gap14: { gap: 14 },
});
