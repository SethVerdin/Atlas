import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomBar, type Panel } from '@/components/atlas/bottom-bar';
import { ChatFeed } from '@/components/atlas/chat-feed';
import { Composer } from '@/components/atlas/composer';
import { ExercisesSheet } from '@/components/atlas/exercises-sheet';
import { MacrosSheet } from '@/components/atlas/macros-sheet';
import { AtlasColors as C } from '@/constants/theme';
import {
  getExercises,
  getMessages,
  getToday,
  saveDraft,
  sendMessage,
  type ChatMessage,
  type DraftEdits,
  type SavedExercise,
  type Today,
} from '@/lib/api';

/** Gap between the top safe-area edge and an open sheet, so the header peeks out. */
const SHEET_TOP_OFFSET = 48;
const MAX_WIDTH = 520;

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [panel, setPanel] = useState<Panel | null>(null);
  const composerRef = useRef<TextInput>(null);
  const [draftText, setDraftText] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const [today, setToday] = useState<Today | null>(null);
  const [exercises, setExercises] = useState<SavedExercise[] | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  useEffect(() => {
    getMessages()
      .then(setMessages)
      .catch((e) => setChatError(errorText(e)));
  }, []);

  // Sheets show the last data right away and refresh every time they open.
  const refreshSheet = useCallback((next: Panel) => {
    setSheetError(null);
    if (next === 'macros') getToday().then(setToday).catch((e) => setSheetError(errorText(e)));
    if (next === 'exercises') getExercises().then(setExercises).catch((e) => setSheetError(errorText(e)));
  }, []);

  const toggle = (next: Panel) => {
    if (panel === next) return setPanel(null);
    setPanel(next);
    refreshSheet(next);
  };
  const close = () => setPanel(null);

  /** Closes any sheet and puts the cursor in the composer, optionally with starting text. */
  const compose = (text?: string) => {
    setPanel(null);
    if (text !== undefined) setDraftText(text);
    composerRef.current?.focus();
  };

  const send = async (text: string) => {
    setPanel(null);
    setDraftText('');
    setSending(text);
    setChatError(null);
    try {
      const added = await sendMessage(text);
      setMessages((m) => [...m, ...added]);
    } catch (e) {
      setChatError(errorText(e));
      // Put the message back so it can be sent again without retyping.
      setDraftText((current) => current || text);
    } finally {
      setSending(null);
    }
  };

  const save = async (messageId: number, edits: DraftEdits) => {
    setChatError(null);
    try {
      const draft = await saveDraft(messageId, edits);
      setMessages((m) => m.map((x) => (x.id === messageId ? { ...x, draft } : x)));
    } catch (e) {
      setChatError(errorText(e));
      // A newer draft may have replaced this one; reload so the feed matches the server.
      getMessages().then(setMessages).catch(() => {});
    }
  };

  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.column}>
        {/* Header and feed; sheets open over this area, above the composer. */}
        <View style={styles.main}>
          <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
            <View style={styles.titleBlock}>
              <Text style={styles.date}>{date}</Text>
              <Text accessibilityRole="header" style={styles.title}>
                Today
              </Text>
            </View>
            <Text style={styles.brand}>ATLAS</Text>
          </View>

          <ChatFeed messages={messages} sending={sending} error={chatError} onSave={save} />

          {panel && (
            <View style={StyleSheet.absoluteFill}>
              <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={StyleSheet.absoluteFill}>
                <Pressable accessibilityLabel="Close" onPress={close} style={styles.scrim} />
              </Animated.View>
              {panel === 'macros' && (
                <MacrosSheet
                  today={today}
                  error={sheetError}
                  top={insets.top + SHEET_TOP_OFFSET}
                  onClose={close}
                  onLogMeal={() => compose()}
                />
              )}
              {panel === 'exercises' && (
                <ExercisesSheet
                  exercises={exercises}
                  error={sheetError}
                  top={insets.top + SHEET_TOP_OFFSET}
                  onClose={close}
                  onPick={(name) => compose(`${name} `)}
                />
              )}
            </View>
          )}
        </View>

        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Composer
            ref={composerRef}
            value={draftText}
            onChangeText={setDraftText}
            onSend={send}
            busy={sending !== null}
          />
          <BottomBar active={panel} onPress={toggle} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  column: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', overflow: 'hidden' },
  main: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  titleBlock: { gap: 2 },
  date: { fontSize: 13, color: C.textSecondary },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5, color: C.text },
  brand: { fontSize: 15, fontWeight: '700', letterSpacing: 3, color: C.accent },
  scrim: { flex: 1, backgroundColor: C.scrim },
  bottom: { paddingHorizontal: 12, paddingTop: 8, gap: 10, backgroundColor: C.bg },
});
