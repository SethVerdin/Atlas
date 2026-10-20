/**
 * Placeholder data for the home screen until the app talks to the API.
 * The chat and meal draft mirror api/examples/sample-turn.json. Carb and fat
 * goals and every exercise except Bench Press are made-up examples.
 */

export type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export type DraftItem = {
  name: string;
  grams: number;
  source: 'usda' | 'estimated';
  estimateBasis?: string;
  totals: Macros;
};

export type MealDraft = { type: 'meal'; title: string; items: DraftItem[]; totals: Macros };

export type WorkoutDraft = { type: 'workout'; exercise: string; sets: number; reps: number; weight: number };

export type ChatMessage =
  | { id: string; kind: 'time'; label: string }
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'agent'; text: string; draft?: MealDraft | WorkoutDraft; saved?: boolean };

export type SavedExercise = {
  name: string;
  group: 'Push' | 'Pull' | 'Legs';
  last: string;
  when: string;
};

export const sampleDate = 'Thursday, Oct 8';
export const units = 'lb';

export const dailyGoals: Macros = { kcal: 2400, protein_g: 160, carbs_g: 260, fat_g: 80 };

export const sampleChat: ChatMessage[] = [
  { id: 't1', kind: 'time', label: '8:02 AM' },
  { id: 'u1', kind: 'user', text: 'bench press 3x8 at 185' },
  {
    id: 'a1',
    kind: 'agent',
    text: 'Drafted: Bench Press, 3 sets of 8 at 185 lb.',
    draft: { type: 'workout', exercise: 'Bench Press', sets: 3, reps: 8, weight: 185 },
    saved: true,
  },
  { id: 't2', kind: 'time', label: '8:14 AM' },
  { id: 'u2', kind: 'user', text: "2 scrambled eggs and a slice of my mom's banana bread" },
  {
    id: 'a2',
    kind: 'agent',
    text: 'Drafted breakfast. Adjust grams if needed, then tap Save.',
    draft: {
      type: 'meal',
      title: 'Breakfast',
      items: [
        {
          name: 'Scrambled eggs',
          grams: 122,
          source: 'usda',
          totals: { kcal: 182, protein_g: 12.2, carbs_g: 2.0, fat_g: 13.4 },
        },
        {
          name: 'Banana bread (homemade)',
          grams: 60,
          source: 'estimated',
          estimateBasis: 'typical homemade recipe',
          totals: { kcal: 196, protein_g: 2.6, carbs_g: 32.8, fat_g: 6.3 },
        },
      ],
      totals: { kcal: 378, protein_g: 14.8, carbs_g: 34.8, fat_g: 19.7 },
    },
  },
];

export const loggedMeals = [{ name: 'Breakfast', time: '8:14 AM', items: 2, kcal: 378 }];

export const savedExercises: SavedExercise[] = [
  { name: 'Bench Press', group: 'Push', last: '3 × 8 · 185 lb', when: 'Today' },
  { name: 'Overhead Press', group: 'Push', last: '4 × 6 · 95 lb', when: 'Oct 7' },
  { name: 'Back Squat', group: 'Legs', last: '5 × 5 · 225 lb', when: 'Oct 6' },
  { name: 'Romanian Deadlift', group: 'Legs', last: '3 × 10 · 135 lb', when: 'Oct 6' },
  { name: 'Pull-up', group: 'Pull', last: '3 × 10 · bodyweight', when: 'Oct 5' },
];

export const sampleTranscript = "2 scrambled eggs and a slice of my mom's banana bread…";
