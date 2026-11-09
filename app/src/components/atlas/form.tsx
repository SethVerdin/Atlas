import { forwardRef, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { AtlasColors as C } from '@/constants/theme';

// Small form pieces shared by the login and account screens.

/** Error red, readable on the dark surfaces. Move to AtlasColors in theme.ts if you like. */
export const DANGER = '#FF8A80';

type FieldProps = TextInputProps & { label: string; hint?: string; right?: ReactNode };

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, hint, right, style, ...input }, ref) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          ref={ref}
          placeholderTextColor={C.textSecondary}
          selectionColor={C.accent}
          style={[styles.input, style]}
          {...input}
        />
        {right}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

type ButtonProps = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};

export function Button({ label, onPress, busy, disabled, variant = 'primary' }: ButtonProps) {
  const off = disabled || busy;
  const fg = variant === 'primary' ? C.onAccent : variant === 'danger' ? DANGER : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.dangerButton,
        off && styles.off,
        pressed && styles.pressed,
      ]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonLabel, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function ErrorText({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
  },
  input: { flex: 1, height: 50, paddingHorizontal: 14, fontSize: 16, color: C.text },
  hint: { fontSize: 12, color: C.textSecondary },
  button: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { backgroundColor: C.accent },
  secondary: { backgroundColor: C.nav, borderWidth: 1, borderColor: C.border },
  dangerButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: DANGER },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
  off: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  error: { fontSize: 14, color: DANGER },
});
