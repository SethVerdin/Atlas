import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_BAR_HEIGHT, BottomBar, type Panel } from '@/components/atlas/bottom-bar';
import { ChatFeed } from '@/components/atlas/chat-feed';
import { ExercisesSheet } from '@/components/atlas/exercises-sheet';
import { MacrosSheet } from '@/components/atlas/macros-sheet';
import { TalkPanel } from '@/components/atlas/talk-panel';
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
  const [talkPrefill, setTalkPrefill] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  // A message that failed to send; reopening the mic brings it back.
  const [unsent, setUnsent] = useState('');
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

  const open = (next: Panel, prefill = '') => {
    setTalkPrefill(prefill);
    setPanel(next);
    refreshSheet(next);
  };
  const toggle = (next: Panel) => (panel === next ? setPanel(null) : open(next, next === 'talk' ? unsent : ''));
  const close = () => setPanel(null);

  const send = async (text: string) => {
    setPanel(null);
    setSending(text);
    setChatError(null);
    try {
      const added = await sendMessage(text);
      setMessages((m) => [...m, ...added]);
      setUnsent('');
    } catch (e) {
      setChatError(errorText(e));
      setUnsent(text);
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
          <View style={[StyleSheet.absoluteFill, { bottom: BOTTOM_BAR_HEIGHT + insets.bottom }]}>
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={StyleSheet.absoluteFill}>
              <Pressable accessibilityLabel="Close" onPress={close} style={styles.scrim} />
            </Animated.View>
            {panel === 'macros' && (
              <MacrosSheet
                today={today}
                error={sheetError}
                top={insets.top + SHEET_TOP_OFFSET}
                onClose={close}
                onLogMeal={() => open('talk')}
              />
            )}
            {panel === 'exercises' && (
              <ExercisesSheet
                exercises={exercises}
                error={sheetError}
                top={insets.top + SHEET_TOP_OFFSET}
                onClose={close}
                onPick={(name) => open('talk', `${name} `)}
              />
            )}
            {panel === 'talk' && <TalkPanel initialText={talkPrefill} onCancel={close} onSend={send} />}
          </View>
        )}

        <BottomBar active={panel} onPress={toggle} bottomInset={insets.bottom} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  column: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', overflow: 'hidden' },
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
});
