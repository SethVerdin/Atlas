import { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { AtlasColors as C } from '@/constants/theme';

/** Form parts for the sign-in and first sign-in screens, in the composer's style. */

/** `style` sizes the whole field (label and box), e.g. flex: 1 in a row. */
type FieldProps = Omit<TextInputProps, 'style'> & { label: string; suffix?: string; style?: StyleProp<ViewStyle> };

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, suffix, style, ...input }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.gap6, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, focused && styles.boxFocused]}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={C.textSecondary}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={styles.input}
        />
        {suffix && <Text style={styles.suffix}>{suffix}</Text>}
      </View>
    </View>
  );
});

type Option<T extends string> = { value: T; label: string; detail?: string };

/** One choice from a few, like the Push / Pull / Legs filter. `stacked` shows one per row with a detail line. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  stacked = false,
}: {
  label?: string;
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  stacked?: boolean;
}) {
  return (
    <View style={styles.gap6}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View accessibilityRole="radiogroup" style={stacked ? styles.gap8 : styles.row}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(o.value)}
              style={({ pressed }) => [
                stacked ? styles.card : styles.pill,
                selected ? styles.selected : styles.idle,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.optionLabel, selected && styles.onAccent]}>{o.label}</Text>
              {o.detail && <Text style={[styles.detail, selected && styles.onAccentSoft]}>{o.detail}</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [styles.button, off ? styles.buttonOff : styles.buttonOn, pressed && styles.pressed]}>
      {busy ? (
        <ActivityIndicator color={C.onAccent} />
      ) : (
        <Text style={[styles.buttonLabel, off && styles.buttonLabelOff]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  gap6: { gap: 6 },
  gap8: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 1, color: C.textSecondary, textTransform: 'uppercase' },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  boxFocused: { borderColor: C.accent },
  // No browser focus ring on web: the box's lime border shows focus instead.
  input: { flex: 1, fontSize: 16, color: C.text, paddingVertical: 12, outlineWidth: 0 },
  suffix: { fontSize: 15, color: C.textSecondary, marginLeft: 8 },
  pill: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  card: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 2 },
  idle: { backgroundColor: C.nav, borderWidth: 1, borderColor: C.border },
  selected: { backgroundColor: C.accent, borderWidth: 1, borderColor: C.accent },
  optionLabel: { fontSize: 15, fontWeight: '600', color: C.textBody },
  detail: { fontSize: 13, color: C.textSecondary },
  onAccent: { color: C.onAccent },
  onAccentSoft: { color: C.onAccent, opacity: 0.75 },
  pressed: { opacity: 0.8 },
  button: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  buttonOn: { backgroundColor: C.accent },
  buttonOff: { backgroundColor: C.bubble },
  buttonLabel: { fontSize: 16, fontWeight: '700', color: C.onAccent },
  buttonLabelOff: { color: C.textSecondary },
  error: { fontSize: 14, color: C.estimatedFg },
});
