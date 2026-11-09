import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorText, Field } from '@/components/atlas/form';
import { AtlasColors as C } from '@/constants/theme';
import { changePassword, type Account } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const MAX_WIDTH = 520;

const GOALS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'protein_g', label: 'Protein', unit: 'g' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g' },
  { key: 'fat_g', label: 'Fat', unit: 'g' },
] as const;
type GoalKey = (typeof GOALS)[number]['key'];

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const toText = (n: number | null) => (n === null ? '' : String(n));

/** The signed-in user's profile, units, and daily goals, saved to their account. */
export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.column}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={close} hitSlop={8} style={styles.back}>
              <Feather name="chevron-left" size={24} color={C.text} />
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>
              Account
            </Text>
          </View>

          {/* key: reset the form if a different account signs in. */}
          {user && <ProfileForm key={user.userId} user={user} />}
          {user && <PasswordSection />}

          <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
          {user && <DeleteSection />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ProfileForm({ user }: { user: Account }) {
  const { updateAccount } = useAuth();
  const [name, setName] = useState(user.displayName ?? '');
  const [units, setUnits] = useState(user.units);
  const [goals, setGoals] = useState<Record<GoalKey, string>>({
    kcal: toText(user.goals.kcal),
    protein_g: toText(user.goals.protein_g),
    carbs_g: toText(user.goals.carbs_g),
    fat_g: toText(user.goals.fat_g),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSaved(false);
  };

  const save = async () => {
    const parsed: Partial<Record<GoalKey, number | null>> = {};
    for (const { key, label } of GOALS) {
      const raw = goals[key].trim();
      if (!raw) {
        parsed[key] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || (key === 'kcal' && n === 0)) {
        return setError(`${label} goal should be a whole number${key === 'kcal' ? ' above 0' : ''}, or blank.`);
      }
      parsed[key] = n;
    }

    setBusy(true);
    setError(null);
    try {
      await updateAccount({ displayName: name.trim() || null, units, goals: parsed });
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Section title="Profile">
        <Field label="Name" value={name} onChangeText={edit(setName)} placeholder="Your name" maxLength={80} />
        <Field label="Email" value={user.email} editable={false} style={styles.readOnly} />
      </Section>

      <Section title="Weight units">
        <View style={styles.segment} accessibilityRole="radiogroup">
          {(['lb', 'kg'] as const).map((u) => {
            const on = units === u;
            return (
              <Pressable
                key={u}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => edit(setUnits)(u)}
                style={[styles.segmentItem, on && styles.segmentOn]}>
                <Text style={[styles.segmentLabel, on && styles.segmentLabelOn]}>{u === 'lb' ? 'Pounds (lb)' : 'Kilograms (kg)'}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Daily goals" note="Shown in the Macros sheet. Leave blank for no goal.">
        <View style={styles.goalGrid}>
          {GOALS.map(({ key, label, unit }) => (
            <View key={key} style={styles.goalCell}>
              <Field
                label={`${label} (${unit})`}
                value={goals[key]}
                onChangeText={(v) => edit(setGoals)({ ...goals, [key]: v.replace(/[^0-9]/g, '') })}
                keyboardType="number-pad"
                placeholder="—"
                maxLength={5}
              />
            </View>
          ))}
        </View>
      </Section>

      <ErrorText>{error}</ErrorText>
      <Button label={saved ? 'Saved' : 'Save changes'} onPress={save} busy={busy} disabled={saved} />
    </>
  );
}

function PasswordSection() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (next.length < 8) return setError('Use at least 8 characters for your new password.');
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setDone(true);
      setOpen(false);
      setCurrent('');
      setNext('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Section title="Password" note={done ? 'Password changed. Other devices were signed out.' : undefined}>
        <Button label="Change password" variant="secondary" onPress={() => setOpen(true)} />
      </Section>
    );
  }
  return (
    <Section title="Password">
      <Field
        label="Current password"
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
      />
      <Field
        label="New password"
        value={next}
        onChangeText={setNext}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint="At least 8 characters. Signs out your other devices."
      />
      <ErrorText>{error}</ErrorText>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
        </View>
        <View style={styles.flex}>
          <Button label="Update" onPress={submit} busy={busy} disabled={!current || !next} />
        </View>
      </View>
    </Section>
  );
}

function DeleteSection() {
  const { deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password); // signs out; _layout.tsx shows the login screen
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.deleteLink} hitSlop={8}>
        <Text style={styles.deleteLinkText}>Delete account</Text>
      </Pressable>
    );
  }
  return (
    <Section title="Delete account" note="This permanently deletes your meals, workouts, chat, and goals. It can't be undone.">
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      <ErrorText>{error}</ErrorText>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label="Keep account" variant="secondary" onPress={() => setOpen(false)} />
        </View>
        <View style={styles.flex}>
          <Button label="Delete forever" variant="danger" onPress={submit} busy={busy} disabled={!password} />
        </View>
      </View>
    </Section>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: -6 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5, color: C.text },
  section: { gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: C.textSecondary },
  note: { fontSize: 13, lineHeight: 18, color: C.textSecondary, marginTop: -6 },
  readOnly: { color: C.textSecondary },
  segment: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 4 },
  segmentItem: { flex: 1, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: C.accent },
  segmentLabel: { fontSize: 14, fontWeight: '600', color: C.textBody },
  segmentLabelOn: { color: C.onAccent },
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  goalCell: { flexBasis: '45%', flexGrow: 1 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  deleteLink: { alignSelf: 'center', paddingVertical: 4 },
  deleteLinkText: { fontSize: 14, color: C.textSecondary, textDecorationLine: 'underline' },
});
