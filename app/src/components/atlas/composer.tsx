import { forwardRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AtlasIcon } from '@/components/atlas/icon';
import { AtlasColors as C } from '@/constants/theme';
import { useSpeech } from '@/hooks/use-speech';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: (text: string) => void;
  /** True while Atlas is answering; sending is paused until it replies. */
  busy: boolean;
};

/**
 * Always-visible message box, like Claude mobile's: type by default, with a small
 * mic for voice. The mic listens where the platform supports speech (web); on
 * iOS/Android it points to the keyboard's own dictation key instead.
 */
export const Composer = forwardRef<TextInput, Props>(function Composer({ value, onChangeText, onSend, busy }, ref) {
  const speech = useSpeech();
  const [hint, setHint] = useState(false);
  const canSend = value.trim().length > 0 && !busy;

  const send = () => {
    if (!canSend) return;
    speech.stop();
    onSend(value.trim());
  };

  const mic = () => {
    if (!speech.supported) {
      // Expo Go has no speech module; the keyboard's dictation key does the job.
      setHint(true);
      if (ref && 'current' in ref) ref.current?.focus();
      return;
    }
    if (speech.listening) speech.stop();
    else speech.start(onChangeText);
  };

  return (
    <View style={styles.box}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => {
          setHint(false);
          onChangeText(t);
        }}
        placeholder={speech.listening ? 'Listening…' : 'Chat with Atlas'}
        placeholderTextColor={C.textSecondary}
        accessibilityLabel="Chat with Atlas"
        multiline
        // Browsers give a multi-line box 2 rows by default; start at one like native.
        numberOfLines={Platform.OS === 'web' ? 1 : undefined}
        maxLength={2000}
        style={styles.input}
        submitBehavior="blurAndSubmit"
        returnKeyType="send"
        onSubmitEditing={send}
      />

      <View style={styles.row}>
        <Text style={styles.hint} numberOfLines={1}>
          {hint ? 'Tap the mic on your keyboard to dictate' : ''}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={speech.listening ? 'Stop listening' : 'Talk to Atlas'}
          accessibilityState={{ selected: speech.listening }}
          onPress={mic}
          hitSlop={6}
          style={({ pressed }) => [styles.iconButton, speech.listening && styles.listening, pressed && styles.pressed]}>
          <AtlasIcon name="mic" size={18} color={speech.listening ? C.onAccent : C.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={send}
          hitSlop={6}
          style={({ pressed }) => [styles.iconButton, canSend ? styles.send : styles.sendOff, pressed && styles.pressed]}>
          <AtlasIcon name="send" size={18} color={canSend ? C.onAccent : C.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 24,
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 14,
    gap: 4,
  },
  input: {
    fontSize: 16,
    lineHeight: 22,
    color: C.text,
    minHeight: 24,
    maxHeight: 120,
    padding: 0,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hint: { flex: 1, fontSize: 12, color: C.textSecondary },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  listening: { backgroundColor: C.accent, boxShadow: '0 0 0 6px rgba(198, 242, 78, 0.18)' },
  send: { backgroundColor: C.accent },
  sendOff: { backgroundColor: C.bubble },
  pressed: { opacity: 0.8 },
});
