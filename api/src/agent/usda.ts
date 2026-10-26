// search_foods backend: USDA FoodData Central search, with each returned food
// cached in usda_foods so draft_meal can look up its per-100 g values later.

import { config } from "../config";
import { db } from "../db";
import type { Per100g } from "./mealDraft";

export interface FoodCandidate {
  fdcId: number;
  description: string;
  per100g: Per100g;
}

interface UsdaNutrient {
  nutrientNumber?: string;
  unitName?: string;
  value?: number;
}

interface UsdaFood {
  fdcId: number;
  description: string;
  foodNutrients?: UsdaNutrient[];
}

const SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
// Generic foods only; branded products crowd out whole-food matches.
const DATA_TYPES = ["Foundation", "SR Legacy", "Survey (FNDDS)"];

const round1 = (n: number) => Math.round(n * 10) / 10;

// USDA search results report nutrients per 100 g for these data types.
function toPer100g(food: UsdaFood): Per100g | null {
  const byNumber = (n: string, unit = "G") =>
    food.foodNutrients?.find((x) => x.nutrientNumber === n && x.unitName?.toUpperCase() === unit)?.value;
  const protein = byNumber("203");
  const fat = byNumber("204");
  const carbs = byNumber("205");
  if (protein === undefined || fat === undefined || carbs === undefined) return null;
  // 208 = Energy; Foundation foods often only have 958/957 (Atwater specific/general).
  const kcal = byNumber("208", "KCAL") ?? byNumber("958", "KCAL") ?? byNumber("957", "KCAL") ?? 4 * protein + 4 * carbs + 9 * fat;
  return { kcal: Math.round(kcal), protein_g: round1(protein), carbs_g: round1(carbs), fat_g: round1(fat) };
}

export async function searchFoods(query: string): Promise<FoodCandidate[]> {
  const res = await fetch(`${SEARCH_URL}?api_key=${encodeURIComponent(config.usdaApiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, pageSize: 8, dataType: DATA_TYPES }),
  });
  if (!res.ok) throw new Error(`USDA search failed (${res.status})`);
  const body = (await res.json()) as { foods?: UsdaFood[] };

  const results: FoodCandidate[] = [];
  for (const food of body.foods ?? []) {
    const per100g = toPer100g(food);
    if (per100g) results.push({ fdcId: food.fdcId, description: food.description, per100g });
    if (results.length === 5) break;
  }

  for (const r of results) {
    await db.query(
      `insert into usda_foods (fdc_id, description, kcal, protein_g, carbs_g, fat_g)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (fdc_id) do update set description = $2, kcal = $3, protein_g = $4, carbs_g = $5, fat_g = $6, fetched_at = now()`,
      [r.fdcId, r.description, r.per100g.kcal, r.per100g.protein_g, r.per100g.carbs_g, r.per100g.fat_g],
    );
  }
  return results;
}

export async function lookupFood(fdcId: number): Promise<Per100g | null> {
  const { rows } = await db.query("select kcal, protein_g, carbs_g, fat_g from usda_foods where fdc_id = $1", [fdcId]);
  if (!rows.length) return null;
  const r = rows[0];
  return { kcal: Number(r.kcal), protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g), fat_g: Number(r.fat_g) };
}
