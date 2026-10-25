import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_BAR_HEIGHT, BottomBar, type Panel } from '@/components/atlas/bottom-bar';
import { ChatFeed } from '@/components/atlas/chat-feed';
import { ExercisesSheet } from '@/components/atlas/exercises-sheet';
import { MacrosSheet } from '@/components/atlas/macros-sheet';
import { TalkPanel } from '@/components/atlas/talk-panel';
import { AtlasColors as C } from '@/constants/theme';
import {
  dailyGoals,
  loggedMeals,
  sampleChat,
  sampleDate,
  sampleTranscript,
  savedExercises,
  units,
} from '@/data/sample-day';

/** Gap between the top safe-area edge and an open sheet, so the header peeks out. */
const SHEET_TOP_OFFSET = 48;
const MAX_WIDTH = 520;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [panel, setPanel] = useState<Panel | null>(null);
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next));
  const close = () => setPanel(null);

  const consumed = sampleChat.reduce(
    (sum, m) =>
      m.kind === 'agent' && m.draft?.type === 'meal'
        ? {
            kcal: sum.kcal + m.draft.totals.kcal,
            protein_g: sum.protein_g + m.draft.totals.protein_g,
            carbs_g: sum.carbs_g + m.draft.totals.carbs_g,
            fat_g: sum.fat_g + m.draft.totals.fat_g,
          }
        : sum,
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  return (
    <View style={styles.root}>
      <View style={styles.column}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.titleBlock}>
            <Text style={styles.date}>{sampleDate}</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Today
            </Text>
          </View>
          <Text style={styles.brand}>ATLAS</Text>
        </View>

        <ChatFeed messages={sampleChat} units={units} />

        {panel && (
          <View style={[StyleSheet.absoluteFill, { bottom: BOTTOM_BAR_HEIGHT + insets.bottom }]}>
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={StyleSheet.absoluteFill}>
              <Pressable accessibilityLabel="Close" onPress={close} style={styles.scrim} />
            </Animated.View>
            {panel === 'macros' && (
              <MacrosSheet
                consumed={consumed}
                goals={dailyGoals}
                meals={loggedMeals}
                top={insets.top + SHEET_TOP_OFFSET}
                onClose={close}
              />
            )}
            {panel === 'exercises' && (
              <ExercisesSheet exercises={savedExercises} top={insets.top + SHEET_TOP_OFFSET} onClose={close} />
            )}
            {panel === 'talk' && <TalkPanel transcript={sampleTranscript} onCancel={close} onSend={close} />}
          </View>
        )}

        <BottomBar active={panel} onPress={toggle} bottomInset={insets.bottom} />
      </View>
    </View>
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
