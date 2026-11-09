import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Choice, Field, FormError, PrimaryButton } from '@/components/atlas/form';
import { AtlasColors as C } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

const MAX_WIDTH = 520;

type Mode = 'login' | 'register';

/** Sign in, or create an account with a username and password. */
export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const creating = mode === 'register';
  const ready = username.trim().length > 0 && password.length > 0 && (!creating || confirm.length > 0);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setConfirm('');
  };

  const submit = async () => {
    if (!ready || busy) return;
    // Checked here for a quick answer; the API checks the same rules.
    if (creating) {
      if (!/^[A-Za-z0-9_.]{3,30}$/.test(username.trim())) {
        return setError('Usernames are 3–30 letters, numbers, dots, or underscores.');
      }
      if (password.length < 8) return setError('Passwords need at least 8 characters.');
      if (password !== confirm) return setError("Those passwords don't match.");
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(mode, username.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={styles.hero}>
            <Text style={styles.brand}>ATLAS</Text>
            <Text accessibilityRole="header" style={styles.title}>
              {creating ? 'Create your account' : 'Welcome back'}
            </Text>
            <Text style={styles.tagline}>Log meals and lifts by chatting with Atlas.</Text>
          </View>

          <View style={styles.card}>
            <Choice
              options={[
                { value: 'login', label: 'Sign in' },
                { value: 'register', label: 'Create account' },
              ]}
              value={mode}
              onChange={switchMode}
            />

            <Field
              label="Username"
              value={username}
              onChangeText={setUsername}
              placeholder="e.g. gym_regular"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              maxLength={30}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              submitBehavior="submit"
            />
            <Field
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder={creating ? 'At least 8 characters' : undefined}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={creating ? 'new-password' : 'current-password'}
              textContentType={creating ? 'newPassword' : 'password'}
              maxLength={128}
              returnKeyType={creating ? 'next' : 'go'}
              onSubmitEditing={() => (creating ? confirmRef.current?.focus() : submit())}
              submitBehavior={creating ? 'submit' : 'blurAndSubmit'}
            />
            {creating && (
              <Field
                ref={confirmRef}
                label="Confirm password"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                maxLength={128}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            )}

            <FormError message={error} />
            <PrimaryButton
              label={creating ? 'Create account' : 'Sign in'}
              onPress={submit}
              disabled={!ready}
              busy={busy}
            />
          </View>

          <Text style={styles.footnote}>
            {creating
              ? 'Your meals, workouts, and chats are private to your account.'
              : 'New to Atlas? Choose "Create account" above.'}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: 24 },
  hero: { gap: 8 },
  brand: { fontSize: 15, fontWeight: '700', letterSpacing: 3, color: C.accent },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5, color: C.text },
  tagline: { fontSize: 15, color: C.textSecondary },
  card: {
    backgroundColor: C.surface2,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 16,
  },
  footnote: { fontSize: 13, color: C.textSecondary, textAlign: 'center' },
});
