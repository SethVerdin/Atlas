import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AtlasIcon } from '@/components/atlas/icon';
import { AtlasColors as C } from '@/constants/theme';
import type { ChatMessage, DraftItem, MealDraft, WorkoutDraft } from '@/data/sample-day';

type Props = { messages: ChatMessage[]; units: string };

export function ChatFeed({ messages, units }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
      {messages.map((m) => {
        if (m.kind === 'time') {
          return (
            <Text key={m.id} style={styles.time}>
              {m.label}
            </Text>
          );
        }
        if (m.kind === 'user') {
          return (
            <View key={m.id} style={styles.userBubble}>
              <Text style={styles.userText}>{m.text}</Text>
            </View>
          );
        }
        return (
          <View key={m.id} style={styles.agent}>
            <Text style={styles.agentText}>{m.text}</Text>
            {m.draft?.type === 'workout' && (
              <WorkoutCard draft={m.draft} saved={m.saved ?? false} units={units} />
            )}
            {m.draft?.type === 'meal' && <MealDraftCard draft={m.draft} initiallySaved={m.saved ?? false} />}
          </View>
        );
      })}
    </ScrollView>
  );
}

function WorkoutCard({ draft, saved, units }: { draft: WorkoutDraft; saved: boolean; units: string }) {
  return (
    <View style={[styles.card, styles.workoutCard]}>
      <View style={styles.gap2}>
        <Text style={styles.cardTitle}>{draft.exercise}</Text>
        <Text style={styles.secondary}>
          {draft.sets} × {draft.reps} · {draft.weight} {units}
        </Text>
      </View>
      {saved && <SavedBadge />}
    </View>
  );
}

function MealDraftCard({ draft, initiallySaved }: { draft: MealDraft; initiallySaved: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const { totals } = draft;
  return (
    <View style={[styles.card, styles.mealCard]}>
      <View style={styles.rowBetween}>
        <Text style={styles.mealTitle}>{draft.title}</Text>
        {saved ? (
          <SavedBadge />
        ) : (
          <View style={styles.draftPill}>
            <Text style={styles.draftPillText}>Draft</Text>
          </View>
        )}
      </View>

      {draft.items.map((item) => (
        <FoodRow key={item.name} item={item} />
      ))}

      <View style={[styles.rowBetween, styles.totals]}>
        <Text style={styles.totalKcal}>{totals.kcal} kcal</Text>
        <Text style={styles.secondary}>P {totals.protein_g} g</Text>
        <Text style={styles.secondary}>C {totals.carbs_g} g</Text>
        <Text style={styles.secondary}>F {totals.fat_g} g</Text>
      </View>

      {!saved && (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" style={[styles.button, styles.buttonSecondary]}>
            <Text style={styles.buttonSecondaryText}>Edit</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSaved(true)}
            style={[styles.button, styles.buttonPrimary]}>
            <Text style={styles.buttonPrimaryText}>Save</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function FoodRow({ item }: { item: DraftItem }) {
  const usda = item.source === 'usda';
  return (
    <View style={[styles.rowBetween, styles.gap8]}>
      <View style={[styles.gap3, styles.shrink]}>
        <Text style={styles.foodName}>
          {item.name} · {item.grams} g
        </Text>
        <View style={styles.tagRow}>
          <View style={[styles.tag, { backgroundColor: usda ? C.usdaBg : C.estimatedBg }]}>
            <Text style={[styles.tagText, { color: usda ? C.usdaFg : C.estimatedFg }]}>
              {usda ? 'USDA' : 'ESTIMATED'}
            </Text>
          </View>
          {item.estimateBasis && <Text style={styles.basis}>{item.estimateBasis}</Text>}
        </View>
      </View>
      <Text style={styles.kcal}>{item.totals.kcal} kcal</Text>
    </View>
  );
}

function SavedBadge() {
  return (
    <View style={styles.saved}>
      <AtlasIcon name="check" size={16} color={C.accent} />
      <Text style={styles.savedText}>Saved</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  time: { alignSelf: 'center', fontSize: 12, color: C.textSecondary },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '78%',
    backgroundColor: C.bubble,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  userText: { fontSize: 15, lineHeight: 21, color: C.text },
  agent: { gap: 8 },
  agentText: { fontSize: 15, lineHeight: 21, color: C.textBody },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
  },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginRight: 40,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  secondary: { fontSize: 13, color: C.textSecondary },
  mealCard: { padding: 14, gap: 12 },
  mealTitle: { fontSize: 16, fontWeight: '600', color: C.text },
  draftPill: {
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  draftPillText: { fontSize: 12, color: C.textSecondary },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  foodName: { fontSize: 14, fontWeight: '500', color: C.text },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  tagText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  basis: { fontSize: 12, color: C.textSecondary },
  kcal: { fontSize: 14, color: C.textBody },
  totals: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 },
  totalKcal: { fontSize: 13, fontWeight: '600', color: C.text },
  actions: { flexDirection: 'row', gap: 8 },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: { borderWidth: 1, borderColor: C.borderStrong },
  buttonSecondaryText: { fontSize: 15, fontWeight: '600', color: C.text },
  buttonPrimary: { backgroundColor: C.accent },
  buttonPrimaryText: { fontSize: 15, fontWeight: '600', color: C.onAccent },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  savedText: { fontSize: 13, fontWeight: '600', color: C.accent },
  gap2: { gap: 2 },
  gap3: { gap: 3 },
  gap8: { gap: 8 },
  shrink: { flexShrink: 1 },
});
