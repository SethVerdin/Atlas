import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { askAtlas, type ChatMessage } from '@/lib/api';

const SUGGESTIONS = [
  'How much protein should I eat a day?',
  '2 scrambled eggs and a slice of toast',
  'My bench press has stalled. What should I change?',
];

type Message = ChatMessage & { id: string };

let nextId = 0;
const newId = () => String(nextId++);

export default function AskScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Message>>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;

    const history = messages.map(({ role, text }) => ({ role, text }));
    setMessages((m) => [...m, { id: newId(), role: 'user', text: question }]);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const reply = await askAtlas(question, history);
      setMessages((m) => [...m, { id: newId(), role: 'model', text: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setMessages([]);
    setError(null);
  }

  const bottomPad =
    Platform.OS === 'web' ? Spacing.four : insets.bottom + BottomTabInset + Spacing.two;

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={[styles.inner, { paddingTop: Platform.OS === 'web' ? Spacing.six * 1.5 : insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Ask Atlas</ThemedText>
          {messages.length > 0 && (
            <Pressable onPress={clear} hitSlop={8} accessibilityRole="button">
              <ThemedText type="small" themeColor="textSecondary">
                Clear
              </ThemedText>
            </Pressable>
          )}
        </View>

        <FlatList
          ref={listRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={messages}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ThemedText themeColor="textSecondary" style={styles.centerText}>
                Ask about nutrition or training, or describe a meal or workout.
              </ThemedText>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => send(s)}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView type="backgroundElement" style={styles.suggestion}>
                    <ThemedText type="small">{s}</ThemedText>
                  </ThemedView>
                </Pressable>
              ))}
            </View>
          }
          renderItem={({ item }) => (
            <ThemedView
              type={item.role === 'user' ? 'backgroundSelected' : 'backgroundElement'}
              style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.modelBubble]}>
              <ThemedText selectable>{item.text}</ThemedText>
            </ThemedView>
          )}
          ListFooterComponent={
            <>
              {loading && (
                <View style={styles.thinking}>
                  <ActivityIndicator color={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Thinking…
                  </ThemedText>
                </View>
              )}
              {error && (
                <ThemedView type="backgroundElement" style={styles.error}>
                  <ThemedText type="small">{error}</ThemedText>
                </ThemedView>
              )}
            </>
          }
        />

        <View style={[styles.inputRow, { paddingBottom: bottomPad }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask a question…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            multiline
            maxLength={2000}
            editable={!loading}
            onSubmitEditing={() => send(input)}
            submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={({ pressed }) => [
              styles.send,
              { backgroundColor: theme.text },
              (!input.trim() || loading) && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              Send
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  centerText: {
    textAlign: 'center',
  },
  suggestion: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
  },
  bubble: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
  },
  modelBubble: {
    alignSelf: 'flex-start',
  },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  error: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: Spacing.three,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: Spacing.four,
    fontSize: 16,
  },
  send: {
    height: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
});
