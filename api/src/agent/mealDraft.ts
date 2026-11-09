// Turns validated draft_meal arguments into a draft the app can render.
// "The model interprets, the code computes": the model picks foods, grams, and
// (when USDA has no match) per-100 g estimates; this file does all the math and
// decides the final source label.

import { z } from "zod";
import { EstimatePer100g, ToolArgs } from "./tools";

/** Calories and macros per 100 g (or totals), as stored for every meal item. */
export type Per100g = Omit<Estimate, "alcohol_g">;

/** The model's per-100 g estimate. alcohol_g is set for alcoholic drinks only. */
export type Estimate = z.infer<typeof EstimatePer100g>;

export interface DraftMealItem {
  name: string;
  grams: number;
  source: "usda" | "estimated";
  fdcId?: number;
  estimateBasis?: string;
  per100g: Per100g; // included so the app can recompute when the user edits grams
  totals: Per100g;
}

export interface MealDraft {
  type: "meal";
  items: DraftMealItem[];
  totals: Per100g;
}

// Looks up per-100 g nutrients for an fdcId, via the PostgreSQL cache, falling back to USDA.
export type UsdaLookup = (fdcId: number) => Promise<Per100g | null>;

// Thrown back to Gemini as a functionResponse error so it can fix the item or ask the user.
export class DraftValidationError extends Error {}

// Energy from macros and alcohol (Atwater factors: 4 kcal/g protein and carbs, 9 fat,
// 7 alcohol). Estimates far from this are rejected. Tolerance covers fiber and rounding.
const ATWATER_TOLERANCE = 0.2;
const ATWATER_SLACK_KCAL = 15;

export function atwaterKcal(e: Omit<Estimate, "kcal">): number {
  return 4 * e.protein_g + 4 * e.carbs_g + 9 * e.fat_g + 7 * (e.alcohol_g ?? 0);
}

export function checkEstimate(name: string, e: Estimate): string[] {
  const issues: string[] = [];
  const alcohol = e.alcohol_g ?? 0;
  const grams = e.protein_g + e.carbs_g + e.fat_g + alcohol;
  if (grams > 100) {
    const parts = alcohol ? "protein + carbs + fat + alcohol" : "protein + carbs + fat";
    issues.push(`${name}: ${parts} is ${grams.toFixed(1)} g per 100 g, which is impossible`);
  }
  const atwater = atwaterKcal(e);
  if (Math.abs(e.kcal - atwater) > Math.max(ATWATER_SLACK_KCAL, atwater * ATWATER_TOLERANCE)) {
    // A drink estimated without alcohol_g looks like it has calories from nowhere.
    const hint = !alcohol && e.kcal > atwater ? "; if it contains alcohol, give alcohol_g (7 kcal/g)" : "";
    issues.push(
      `${name}: ${e.kcal} kcal does not match its macros (about ${Math.round(atwater)} kcal); re-estimate consistently${hint}`,
    );
  }
  return issues;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function scale(per100g: Per100g, grams: number): Per100g {
  const f = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * f),
    protein_g: round1(per100g.protein_g * f),
    carbs_g: round1(per100g.carbs_g * f),
    fat_g: round1(per100g.fat_g * f),
  };
}

/**
 * @param args       Raw draft_meal arguments from Gemini.
 * @param seenFdcIds fdcIds returned by search_foods during this chat turn. An fdcId
 *                   the model did not get from a search is treated as made up.
 */
export async function buildMealDraft(
  args: unknown,
  seenFdcIds: Set<number>,
  lookup: UsdaLookup,
): Promise<MealDraft> {
  const parsed = ToolArgs.draft_meal.safeParse(args);
  if (!parsed.success) {
    throw new DraftValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const issues: string[] = [];
  const items: DraftMealItem[] = [];

  for (const item of parsed.data.items) {
    if (item.source === "usda") {
      const usda = seenFdcIds.has(item.fdcId!) ? await lookup(item.fdcId!) : null;
      if (!usda) {
        issues.push(`${item.name}: fdcId ${item.fdcId} was not returned by search_foods; search again or estimate`);
        continue;
      }
      items.push({ name: item.name, grams: item.grams, source: "usda", fdcId: item.fdcId, per100g: usda, totals: scale(usda, item.grams) });
    } else {
      const est = item.estimatePer100g!;
      const estIssues = checkEstimate(item.name, est);
      if (estIssues.length) {
        issues.push(...estIssues);
        continue;
      }
      // Alcohol only feeds the check: its calories are already in kcal, and meal items
      // store kcal, protein, carbs, and fat.
      const per100g = { kcal: est.kcal, protein_g: est.protein_g, carbs_g: est.carbs_g, fat_g: est.fat_g };
      items.push({
        name: item.name,
        grams: item.grams,
        source: "estimated",
        estimateBasis: item.estimateBasis,
        per100g,
        totals: scale(per100g, item.grams),
      });
    }
  }

  if (issues.length) throw new DraftValidationError(issues.join("; "));

  const totals = items.reduce<Per100g>(
    (t, i) => ({
      kcal: t.kcal + i.totals.kcal,
      protein_g: round1(t.protein_g + i.totals.protein_g),
      carbs_g: round1(t.carbs_g + i.totals.carbs_g),
      fat_g: round1(t.fat_g + i.totals.fat_g),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  return { type: "meal", items, totals };
}
