import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AtlasIcon } from '@/components/atlas/icon';
import { AtlasColors as C } from '@/constants/theme';
import type { ChatMessage, DraftEdits, Macros, MealDraft, MealItem, WorkoutDraft, WorkoutEntry } from '@/lib/api';

type Props = {
  messages: ChatMessage[];
  /** Text the user just sent, shown until Atlas answers. */
  sending: string | null;
  error: string | null;
  onSave: (messageId: number, edits: DraftEdits) => Promise<void>;
};

/** Show a time label above a message when it starts a new burst of chat. */
const TIME_GAP_MS = 10 * 60 * 1000;

function timeLabel(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export function ChatFeed({ messages, sending, error, onSave }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
      {messages.length === 0 && !sending && (
        <Text style={styles.empty}>
          Tell Atlas what you ate or lifted, like “bench press 3x8 at 185”.
        </Text>
      )}

      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const showTime =
          !prev || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > TIME_GAP_MS;
        return (
          <View key={m.id} style={styles.gap12}>
            {showTime && <Text style={styles.time}>{timeLabel(m.createdAt)}</Text>}
            {m.role === 'user' ? (
              <UserBubble text={m.text} />
            ) : (
              <View style={styles.agent}>
                <Text style={styles.agentText}>{m.text}</Text>
                {m.draft?.type === 'workout' && (
                  <WorkoutCard draft={m.draft} onSave={(edits) => onSave(m.id, edits)} />
                )}
                {m.draft?.type === 'meal' && (
                  <MealDraftCard draft={m.draft} onSave={(edits) => onSave(m.id, edits)} />
                )}
              </View>
            )}
          </View>
        );
      })}

      {sending && (
        <>
          <UserBubble text={sending} />
          <View style={styles.thinking}>
            <ActivityIndicator size="small" color={C.textSecondary} />
            <Text style={styles.secondary}>Atlas is thinking…</Text>
          </View>
        </>
      )}

      {error && (
        <View style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <View style={styles.userBubble}>
      <Text style={styles.userText}>{text}</Text>
    </View>
  );
}

// ---- Workout ----

const loadText = (e: { weight: number | null; unit: string }) =>
  e.weight === null ? 'bodyweight' : `${e.weight} ${e.unit}`;

type SetFields = { sets: string; reps: string; weight: string };

function WorkoutCard({ draft, onSave }: { draft: WorkoutDraft; onSave: (edits: DraftEdits) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<SetFields[]>([]);
  const saved = draft.status === 'saved';

  if (saved) {
    return (
      <View style={[styles.card, styles.workoutCard]}>
        <View style={[styles.gap8, styles.shrink]}>
          {draft.entries.map((e) => (
            <EntrySummary key={e.logId} entry={e} />
          ))}
        </View>
        <SavedBadge />
      </View>
    );
  }

  const startEdit = () => {
    setFields(
      draft.entries.map((e) => ({ sets: String(e.sets), reps: String(e.reps), weight: e.weight === null ? '' : String(e.weight) })),
    );
    setEditing(true);
  };
  const update = (i: number, key: keyof SetFields, value: string) =>
    setFields((f) => f.map((row, j) => (j === i ? { ...row, [key]: value } : row)));

  const edits = (): DraftEdits | null => {
    if (!editing) return {};
    const entries = draft.entries.map((e, i) => ({
      logId: e.logId,
      sets: Number(fields[i].sets),
      reps: Number(fields[i].reps),
      weight: fields[i].weight.trim() === '' ? null : Number(fields[i].weight),
    }));
    // Same limits as the API (DraftEdits in api/src/drafts.ts).
    const between = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
    const valid = entries.every(
      (e) => between(e.sets, 1, 30) && between(e.reps, 1, 100) && (e.weight === null || (e.weight >= 0 && e.weight <= 1500)),
    );
    return valid ? { entries } : null;
  };

  return (
    <View style={[styles.card, styles.draftCard]}>
      <CardHeader title="Workout" />
      {draft.entries.map((e, i) =>
        editing ? (
          <View key={e.logId} style={styles.gap6}>
            <Text style={styles.foodName}>{e.name}</Text>
            <View style={styles.editRow}>
              <NumberField label="sets" value={fields[i].sets} onChange={(v) => update(i, 'sets', v)} />
              <Text style={styles.secondary}>×</Text>
              <NumberField label="reps" value={fields[i].reps} onChange={(v) => update(i, 'reps', v)} />
              <Text style={styles.secondary}>·</Text>
              <NumberField
                label={e.unit}
                placeholder="body"
                value={fields[i].weight}
                onChange={(v) => update(i, 'weight', v)}
              />
            </View>
          </View>
        ) : (
          <EntrySummary key={e.logId} entry={e} />
        ),
      )}
      <DraftActions editing={editing} onEdit={startEdit} onDone={() => setEditing(false)} getEdits={edits} onSave={onSave} />
    </View>
  );
}

function EntrySummary({ entry }: { entry: WorkoutEntry }) {
  return (
    <View style={styles.gap2}>
      <Text style={styles.cardTitle}>{entry.name}</Text>
      <Text style={styles.secondary}>
        {entry.sets} × {entry.reps} · {loadText(entry)}
      </Text>
    </View>
  );
}

// ---- Meal ----

const round1 = (n: number) => Math.round(n * 10) / 10;

function scale(per100g: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: per100g.kcal * f,
    protein_g: per100g.protein_g * f,
    carbs_g: per100g.carbs_g * f,
    fat_g: per100g.fat_g * f,
  };
}

function MealDraftCard({ draft, onSave }: { draft: MealDraft; onSave: (edits: DraftEdits) => Promise<void> }) {
  const [edit, setEditing] = useState(false);
  const [grams, setGrams] = useState<string[]>([]);
  const saved = draft.status === 'saved';
  const editing = edit && !saved;

  // While editing, preview totals from the per-100 g values; the API recomputes on save.
  const gramsAt = (i: number) => (editing ? Number(grams[i]) || 0 : draft.items[i].grams);
  const itemTotals = draft.items.map((item, i) => (editing ? scale(item.per100g, gramsAt(i)) : item.totals));
  const totals = editing
    ? itemTotals.reduce(
        (t, x) => ({
          kcal: t.kcal + x.kcal,
          protein_g: t.protein_g + x.protein_g,
          carbs_g: t.carbs_g + x.carbs_g,
          fat_g: t.fat_g + x.fat_g,
        }),
        { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      )
    : draft.totals;

  const edits = (): DraftEdits | null => {
    if (!editing) return {};
    const items = draft.items.map((item, i) => ({ itemId: item.itemId, grams: Number(grams[i]) }));
    return items.every((x) => x.grams > 0 && x.grams <= 3000) ? { items } : null;
  };

  return (
    <View style={[styles.card, styles.draftCard]}>
      <CardHeader title={capitalize(draft.mealType)} saved={saved} />

      {draft.items.map((item, i) => (
        <FoodRow
          key={item.itemId}
          item={item}
          kcal={itemTotals[i].kcal}
          grams={
            editing ? (
              <NumberField
                label="g"
                value={grams[i]}
                onChange={(v) => setGrams((g) => g.map((x, j) => (j === i ? v : x)))}
              />
            ) : null
          }
        />
      ))}

      <View style={[styles.rowBetween, styles.totals]}>
        <Text style={styles.totalKcal}>{Math.round(totals.kcal)} kcal</Text>
        <Text style={styles.secondary}>P {round1(totals.protein_g)} g</Text>
        <Text style={styles.secondary}>C {round1(totals.carbs_g)} g</Text>
        <Text style={styles.secondary}>F {round1(totals.fat_g)} g</Text>
      </View>

      {!saved && (
        <DraftActions
          editing={editing}
          onEdit={() => {
            setGrams(draft.items.map((x) => String(x.grams)));
            setEditing(true);
          }}
          onDone={() => setEditing(false)}
          getEdits={edits}
          onSave={onSave}
        />
      )}
    </View>
  );
}

function FoodRow({ item, kcal, grams }: { item: MealItem; kcal: number; grams: ReactNode }) {
  const usda = item.source === 'usda';
  return (
    <View style={[styles.rowBetween, styles.gap8]}>
      <View style={[styles.gap3, styles.shrink]}>
        {grams ? (
          <View style={styles.editRow}>
            <Text style={[styles.foodName, styles.shrink]}>{item.name}</Text>
            {grams}
          </View>
        ) : (
          <Text style={styles.foodName}>
            {item.name} · {item.grams} g
          </Text>
        )}
        <View style={styles.tagRow}>
          <View style={[styles.tag, { backgroundColor: usda ? C.usdaBg : C.estimatedBg }]}>
            <Text style={[styles.tagText, { color: usda ? C.usdaFg : C.estimatedFg }]}>
              {usda ? 'USDA' : 'ESTIMATED'}
            </Text>
          </View>
          {item.estimateBasis && <Text style={[styles.basis, styles.shrink]}>{item.estimateBasis}</Text>}
        </View>
      </View>
      <Text style={styles.kcal}>{Math.round(kcal)} kcal</Text>
    </View>
  );
}

// ---- Shared pieces ----

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function CardHeader({ title, saved = false }: { title: string; saved?: boolean }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.mealTitle}>{title}</Text>
      {saved ? (
        <SavedBadge />
      ) : (
        <View style={styles.draftPill}>
          <Text style={styles.draftPillText}>Draft</Text>
        </View>
      )}
    </View>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9.]/g, ''))}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={C.textSecondary}
        selectTextOnFocus
        style={styles.input}
      />
      <Text style={styles.secondary}>{label}</Text>
    </View>
  );
}

function DraftActions({
  editing,
  onEdit,
  onDone,
  getEdits,
  onSave,
}: {
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  getEdits: () => DraftEdits | null;
  onSave: (edits: DraftEdits) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const save = async () => {
    const edits = getEdits();
    if (!edits) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setSaving(true);
    try {
      await onSave(edits);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.gap8}>
      {invalid && <Text style={styles.errorText}>Check the numbers: sets 1–30, reps 1–100, grams up to 3,000.</Text>}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={editing ? onDone : onEdit}
          disabled={saving}
          style={[styles.button, styles.buttonSecondary]}>
          <Text style={styles.buttonSecondaryText}>{editing ? 'Cancel' : 'Edit'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving, busy: saving }}
          onPress={save}
          disabled={saving}
          style={[styles.button, styles.buttonPrimary, saving && styles.busy]}>
          {saving ? (
            <ActivityIndicator size="small" color={C.onAccent} />
          ) : (
            <Text style={styles.buttonPrimaryText}>Save</Text>
          )}
        </Pressable>
      </View>
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
  empty: { alignSelf: 'center', textAlign: 'center', maxWidth: 280, fontSize: 15, lineHeight: 21, color: C.textSecondary },
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
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  error: { backgroundColor: C.estimatedBg, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  errorText: { fontSize: 14, lineHeight: 20, color: C.estimatedFg },
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
  draftCard: { padding: 14, gap: 12 },
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
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: {
    width: 64,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.borderStrong,
    backgroundColor: C.bg,
    color: C.text,
    fontSize: 14,
    textAlign: 'center',
  },
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
  busy: { opacity: 0.7 },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  savedText: { fontSize: 13, fontWeight: '600', color: C.accent },
  gap2: { gap: 2 },
  gap3: { gap: 3 },
  gap6: { gap: 6 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  shrink: { flexShrink: 1 },
});
