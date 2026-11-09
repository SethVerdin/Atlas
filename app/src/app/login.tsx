import Feather from '@expo/vector-icons/Feather';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorText, Field } from '@/components/atlas/form';
import { AtlasColors as C } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

const MAX_WIDTH = 420;

type Mode = 'signIn' | 'signUp';

/** Sign in or create an account. Shown whenever no one is signed in (see _layout.tsx). */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const isSignUp = mode === 'signUp';
  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    if (isSignUp && password.length < 8) return setError('Use at least 8 characters for your password.');
    setBusy(true);
    setError(null);
    try {
      if (isSignUp) await signUp(email.trim(), password, name.trim());
      else await signIn(email.trim(), password);
      // _layout.tsx switches to the home screen once signed in.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(isSignUp ? 'signIn' : 'signUp');
    setError(null);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.column}>
          <View style={styles.hero}>
            <Text style={styles.brand}>ATLAS</Text>
            <Text accessibilityRole="header" style={styles.title}>
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </Text>
            <Text style={styles.subtitle}>
              {isSignUp
                ? 'Your meals, workouts, and goals are saved to your account.'
                : 'Sign in to pick up where you left off.'}
            </Text>
          </View>

          <View style={styles.form}>
            {isSignUp && (
              <Field
                label="Name"
                placeholder="What should Atlas call you?"
                value={name}
                onChangeText={setName}
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                maxLength={80}
              />
            )}
            <Field
              ref={emailRef}
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType={isSignUp ? 'emailAddress' : 'username'}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              ref={passwordRef}
              label="Password"
              placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              returnKeyType="go"
              onSubmitEditing={submit}
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  onPress={() => setShowPassword((s) => !s)}
                  hitSlop={8}
                  style={styles.eye}>
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={C.textSecondary} />
                </Pressable>
              }
            />

            <ErrorText>{error}</ErrorText>

            <Button label={isSignUp ? 'Create account' : 'Sign in'} onPress={submit} busy={busy} disabled={!canSubmit} />
          </View>

          <Pressable accessibilityRole="button" onPress={switchMode} style={styles.switch} hitSlop={8}>
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account? ' : 'New to Atlas? '}
              <Text style={styles.switchLink}>{isSignUp ? 'Sign in' : 'Create an account'}</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: 28 },
  hero: { gap: 8 },
  brand: { fontSize: 15, fontWeight: '700', letterSpacing: 3, color: C.accent, marginBottom: 12 },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5, color: C.text },
  subtitle: { fontSize: 15, lineHeight: 21, color: C.textSecondary },
  form: { gap: 16 },
  eye: { paddingHorizontal: 14, height: 50, justifyContent: 'center' },
  switch: { alignSelf: 'center', paddingVertical: 8 },
  switchText: { fontSize: 14, color: C.textSecondary },
  switchLink: { color: C.accent, fontWeight: '600' },
});
