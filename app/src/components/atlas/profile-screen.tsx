import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Choice, Field, FormError, PrimaryButton } from '@/components/atlas/form';
import { AtlasColors as C } from '@/constants/theme';
import { saveProfile, type BodyGoal, type Me, type Profile, type Sex } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const MAX_WIDTH = 520;
const CM_PER_IN = 2.54;
const LB_PER_KG = 2.20462;

type Units = 'imperial' | 'metric';

/** Whole or decimal number from a text box; NaN when empty or not a number. */
const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));
const round1 = (n: number) => String(Math.round(n * 10) / 10);

/** 180 cm → { feet: '5', inches: '10.9' } */
function feetInches(heightCm: number) {
  const totalIn = Math.round((heightCm / CM_PER_IN) * 10) / 10;
  const feet = Math.floor(totalIn / 12);
  return { feet: String(feet), inches: round1(totalIn - feet * 12) };
}

/** Text box values for a saved profile, in the units the user picked. */
function initialFields(profile: Profile | null, units: Units) {
  if (!profile) return { age: '', feet: '', inches: '', cm: '', weight: '' };
  return {
    age: String(profile.age),
    ...feetInches(profile.heightCm),
    cm: round1(profile.heightCm),
    weight: round1(units === 'metric' ? profile.weightKg : profile.weightKg * LB_PER_KG),
  };
}

/**
 * Gender, age, height, weight, and goal. The API turns the answers into daily calorie
 * and macro goals (api/src/macros.ts), which this screen shows after saving.
 * - `setup`: asked once, right after the first sign-in (app/about-you.tsx).
 * - `edit`: opened from Home to change the answers (app/profile.tsx); starts filled in.
 */
export function ProfileScreen({ mode }: { mode: 'setup' | 'edit' }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, setUser, signOut } = useAuth();
  const me = state.status === 'signedIn' ? state.user : null;
  const profile = me?.profile ?? null;
  const editing = mode === 'edit';

  const [units, setUnits] = useState<Units>(me?.units === 'kg' ? 'metric' : 'imperial');
  const [initial] = useState(() => initialFields(profile, units));
  const [sex, setSex] = useState<Sex | null>(profile?.sex ?? null);
  const [age, setAge] = useState(initial.age);
  const [feet, setFeet] = useState(initial.feet);
  const [inches, setInches] = useState(initial.inches);
  const [cm, setCm] = useState(initial.cm);
  const [weight, setWeight] = useState(initial.weight);
  const [goal, setGoal] = useState<BodyGoal | null>(profile?.goal ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Me | null>(null);

  const heightCm = units === 'metric' ? num(cm) : ((num(feet) || 0) * 12 + (num(inches) || 0)) * CM_PER_IN;
  const weightKg = units === 'metric' ? num(weight) : num(weight) / LB_PER_KG;
  const ready =
    sex !== null && goal !== null && age !== '' && weight !== '' && (units === 'metric' ? cm !== '' : feet !== '');

  // Switching units converts what's typed, so a filled-in form stays correct.
  const switchUnits = (next: Units) => {
    if (next === units) return;
    if (next === 'metric') {
      if (feet !== '') setCm(round1(heightCm));
      if (weight !== '') setWeight(round1(num(weight) / LB_PER_KG));
    } else {
      if (cm !== '') {
        const f = feetInches(num(cm));
        setFeet(f.feet);
        setInches(f.inches);
      }
      if (weight !== '') setWeight(round1(num(weight) * LB_PER_KG));
    }
    setUnits(next);
  };

  const submit = async () => {
    if (!ready || busy || !sex || !goal) return;
    const years = num(age);
    if (!Number.isInteger(years) || years < 13 || years > 120)
      return setError('Enter your age in whole years (13 or older).');
    if (!(heightCm >= 100 && heightCm <= 250)) return setError('Check your height.');
    if (!(weightKg >= 30 && weightKg <= 300)) return setError('Check your weight.');
    setBusy(true);
    setError(null);
    try {
      setSaved(await saveProfile({ sex, age: years, heightCm, weightKg, goal }, units === 'metric' ? 'kg' : 'lb'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <Targets
        me={saved}
        title={editing ? 'Your new daily targets' : 'Your daily targets'}
        button={editing ? 'Done' : 'Start logging'}
        onDone={() => {
          setUser(saved);
          if (editing) router.back();
        }}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <Text style={styles.small}>{editing ? me?.username : `Welcome, ${me?.username ?? ''}`}</Text>
              <Text accessibilityRole="header" style={styles.title}>
                {editing ? 'Your info' : 'About you'}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={editing ? () => router.back() : signOut} hitSlop={8}>
              <Text style={styles.link}>{editing ? 'Cancel' : 'Sign out'}</Text>
            </Pressable>
          </View>
          <Text style={styles.intro}>
            {editing
              ? 'Saving recalculates your daily calories, protein, carbs, and fat.'
              : 'Atlas uses these to set your daily calories, protein, carbs, and fat.'}
          </Text>

          <Choice
            label="Gender"
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
              { value: 'other', label: 'Other' },
            ]}
            value={sex}
            onChange={setSex}
          />

          <Field label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} suffix="years" />

          <Choice
            label="Units"
            options={[
              { value: 'imperial', label: 'lb · ft' },
              { value: 'metric', label: 'kg · cm' },
            ]}
            value={units}
            onChange={switchUnits}
          />

          {units === 'imperial' ? (
            <View style={styles.row}>
              <Field
                label="Height"
                value={feet}
                onChangeText={setFeet}
                keyboardType="number-pad"
                maxLength={1}
                suffix="ft"
                style={styles.flex}
              />
              <Field
                label=" "
                value={inches}
                onChangeText={setInches}
                keyboardType="decimal-pad"
                maxLength={4}
                suffix="in"
                style={styles.flex}
                accessibilityLabel="Height, inches"
              />
            </View>
          ) : (
            <Field
              label="Height"
              value={cm}
              onChangeText={setCm}
              keyboardType="decimal-pad"
              maxLength={5}
              suffix="cm"
            />
          )}

          <Field
            label="Weight"
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            maxLength={5}
            suffix={units === 'metric' ? 'kg' : 'lb'}
          />

          <Choice
            label="Your goal"
            stacked
            options={[
              { value: 'lose', label: 'Lose weight', detail: 'About 1 lb (0.5 kg) a week, with extra protein' },
              { value: 'maintain', label: 'Maintain', detail: 'Stay at your current weight' },
              { value: 'gain', label: 'Gain weight', detail: 'A small surplus for lean gains' },
            ]}
            value={goal}
            onChange={setGoal}
          />

          <FormError message={error} />
          <PrimaryButton
            label={editing ? 'Update my daily targets' : 'Set my daily targets'}
            onPress={submit}
            disabled={!ready}
            busy={busy}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** The goals the API worked out, shown after saving. */
function Targets({ me, title, button, onDone }: { me: Me; title: string; button: string; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const g = me.goals;
  const macros = [
    { label: 'Protein', grams: g.protein_g, color: C.accent },
    { label: 'Carbs', grams: g.carbs_g, color: C.carbs },
    { label: 'Fat', grams: g.fat_g, color: C.fat },
  ];
  return (
    <View style={[styles.root, styles.scroll, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.column, styles.flex]}>
        <View style={styles.titleBlock}>
          <Text style={styles.brand}>ATLAS</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.kcalRow}>
            <Text style={styles.kcalBig}>{(g.kcal ?? 0).toLocaleString()}</Text>
            <Text style={styles.kcalUnit}>kcal a day</Text>
          </View>
          {macros.map((m) => (
            <View key={m.label} style={styles.macroRow}>
              <View style={[styles.dot, { backgroundColor: m.color }]} />
              <Text style={styles.macroLabel}>{m.label}</Text>
              <Text style={styles.macroGrams}>{m.grams} g</Text>
            </View>
          ))}
        </View>
        <Text style={styles.intro}>These show in Macros, and Atlas uses them when it gives advice.</Text>

        <View style={styles.flex} />
        <PrimaryButton label={button} onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: 20 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 10 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  titleBlock: { gap: 2 },
  small: { fontSize: 13, color: C.textSecondary },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5, color: C.text },
  brand: { fontSize: 15, fontWeight: '700', letterSpacing: 3, color: C.accent, marginBottom: 6 },
  link: { fontSize: 14, fontWeight: '500', color: C.textSecondary },
  intro: { fontSize: 15, lineHeight: 21, color: C.textSecondary },
  card: { backgroundColor: C.surface2, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 18, gap: 14 },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  kcalBig: { fontSize: 44, fontWeight: '700', letterSpacing: -1, color: C.text },
  kcalUnit: { fontSize: 15, color: C.textSecondary },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  macroLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: C.text },
  macroGrams: { fontSize: 15, color: C.text },
});
