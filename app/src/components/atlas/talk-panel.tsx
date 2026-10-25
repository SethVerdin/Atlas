import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Reanimated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { AtlasColors as C } from '@/constants/theme';
import { useSpeech } from '@/hooks/use-speech';

const WAVE = [10, 18, 28, 16, 34, 24, 12, 30, 38, 22, 14, 26, 36, 20, 10, 24, 32, 18, 28, 12, 22, 34, 16, 26, 14, 20, 10, 8];

type Props = {
  /** Text to start with, e.g. "Bench Press " from the exercises list. */
  initialText?: string;
  onCancel: () => void;
  onSend: (text: string) => void;
};

/**
 * Opened by the center button. Listens where the platform supports speech
 * (web); otherwise the user types or uses the keyboard's dictation.
 */
export function TalkPanel({ initialText = '', onCancel, onSend }: Props) {
  const speech = useSpeech();
  const [text, setText] = useState(initialText);
  const [pulse] = useState(() => new Animated.Value(0));

  // Start listening as soon as the panel opens, if speech is available.
  useEffect(() => {
    if (speech.supported && !initialText) speech.start(setText);
    return speech.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!speech.listening) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [speech.listening, pulse]);

  const send = () => {
    const message = text.trim();
    if (!message) return;
    speech.stop();
    onSend(message);
  };
  const cancel = () => {
    speech.stop();
    onCancel();
  };

  const status = speech.listening ? 'LISTENING' : speech.supported ? 'TAP THE MIC TO TALK' : 'TELL ATLAS';

  return (
    <Reanimated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(160)}
      accessibilityLabel="Talking to Atlas"
      style={styles.panel}>
      <Pressable
        accessibilityRole="button"
        disabled={!speech.supported}
        onPress={() => (speech.listening ? speech.stop() : speech.start(setText))}
        style={styles.status}>
        <View style={[styles.dot, !speech.listening && styles.dotIdle]} />
        <Text style={styles.statusText}>{status}</Text>
      </Pressable>

      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus={!speech.supported}
        multiline
        placeholder="e.g. 2 scrambled eggs and a slice of toast"
        placeholderTextColor={C.textSecondary}
        accessibilityLabel="Message to Atlas"
        style={styles.transcript}
        maxLength={2000}
        submitBehavior="blurAndSubmit"
        returnKeyType="send"
        onSubmitEditing={send}
      />

      <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {WAVE.map((h, i) => (
          <Animated.View
            key={i}
            style={[
              styles.waveBar,
              { height: h, opacity: speech.listening ? 1 : 0.35 },
              {
                transform: [
                  { scaleY: pulse.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [1, 0.45] : [0.5, 1] }) },
                ],
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={cancel} style={[styles.button, styles.secondary]}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !text.trim() }}
          disabled={!text.trim()}
          onPress={send}
          style={[styles.button, styles.primary, !text.trim() && styles.disabled]}>
          <Text style={styles.primaryText}>Send</Text>
        </Pressable>
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  dotIdle: { opacity: 0.4 },
  statusText: { fontSize: 13, fontWeight: '600', letterSpacing: 1, color: C.accent },
  transcript: {
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '500',
    color: C.text,
    minHeight: 54,
    maxHeight: 160,
    padding: 0,
    textAlignVertical: 'top',
  },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, overflow: 'hidden' },
  waveBar: { width: 4, borderRadius: 2, backgroundColor: C.accent },
  actions: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondary: { borderWidth: 1, borderColor: C.borderStrong },
  secondaryText: { fontSize: 15, fontWeight: '600', color: C.text },
  primary: { backgroundColor: C.accent },
  primaryText: { fontSize: 15, fontWeight: '600', color: C.onAccent },
  disabled: { opacity: 0.5 },
});
