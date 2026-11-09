// Daily calorie and macro goals from the first sign-in questions.
//
// 1. Resting energy (BMR), Mifflin-St Jeor:
//      10 × kg + 6.25 × cm − 5 × age + 5 (male) / − 161 (female) / − 78 (other: the midpoint)
// 2. × 1.375 for daily activity (light exercise, the typical Atlas user; not asked yet)
// 3. Goal: lose −500 kcal (about 0.5 kg a week), maintain ±0, gain +300 (lean gain).
//    Never below 1200 kcal.
// 4. Protein by body weight (g/kg): lose 2.0 (keeps muscle in a deficit), maintain 1.6,
//    gain 1.8. Fat 25% of calories. Carbs get the rest.
// Macros use 4 kcal/g protein and carbs, 9 kcal/g fat, matching src/agent/mealDraft.ts.

export type Sex = "male" | "female" | "other";
export type BodyGoal = "lose" | "maintain" | "gain";

export interface BodyProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goal: BodyGoal;
}

const SEX_OFFSET: Record<Sex, number> = { male: 5, female: -161, other: -78 };
const ACTIVITY = 1.375;
const KCAL_CHANGE: Record<BodyGoal, number> = { lose: -500, maintain: 0, gain: 300 };
const PROTEIN_G_PER_KG: Record<BodyGoal, number> = { lose: 2.0, maintain: 1.6, gain: 1.8 };
const FAT_SHARE = 0.25;
const MIN_KCAL = 1200;

export function dailyGoals(p: BodyProfile): { kcal: number; protein_g: number; carbs_g: number; fat_g: number } {
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + SEX_OFFSET[p.sex];
  const kcal = Math.max(MIN_KCAL, Math.round((bmr * ACTIVITY + KCAL_CHANGE[p.goal]) / 10) * 10);
  const protein_g = Math.round(p.weightKg * PROTEIN_G_PER_KG[p.goal]);
  const fat_g = Math.round((kcal * FAT_SHARE) / 9);
  const carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
  return { kcal, protein_g, carbs_g, fat_g };
}
