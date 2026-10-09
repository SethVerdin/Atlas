// Tool declarations sent to Gemini, plus Zod schemas the API uses to validate the
// arguments Gemini sends back. No tool takes a userId: the API scopes every call
// to the user ID in the bearer token (OWASP API1, broken object-level auth).
// No tool writes data; saving happens only via POST /v1/meals and /v1/workouts.

import { z } from "zod";

// ---- Gemini function declarations (REST/SDK "tools" field) ----

const estimatePer100gSchema = {
  type: "OBJECT",
  description: "Estimated nutrients per 100 g. Only when source is 'estimate'.",
  properties: {
    kcal: { type: "NUMBER" },
    protein_g: { type: "NUMBER" },
    carbs_g: { type: "NUMBER" },
    fat_g: { type: "NUMBER" },
  },
  required: ["kcal", "protein_g", "carbs_g", "fat_g"],
};

export const TOOL_DECLARATIONS = [
  {
    functionDeclarations: [
      {
        name: "search_foods",
        description:
          "Search USDA FoodData Central (cached) for ONE food item. Returns up to 5 candidates with fdcId, description, and per-100 g nutrients.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Single food, e.g. 'scrambled egg'." },
          },
          required: ["query"],
        },
      },
      {
        name: "find_exercise",
        description: "Resolve an exercise name or alias (e.g. 'flat bench') to the catalog.",
        parameters: {
          type: "OBJECT",
          properties: { name: { type: "STRING" } },
          required: ["name"],
        },
      },
      {
        name: "draft_meal",
        description:
          "Create an UNSAVED meal draft for the user to review. Does not write data. Each item uses either a USDA fdcId or an estimate.",
        parameters: {
          type: "OBJECT",
          properties: {
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" },
                  grams: { type: "NUMBER" },
                  source: { type: "STRING", enum: ["usda", "estimate"] },
                  fdcId: { type: "INTEGER", description: "Required when source is 'usda'." },
                  estimatePer100g: estimatePer100gSchema,
                  estimateBasis: {
                    type: "STRING",
                    description: "Required when source is 'estimate'. One line, e.g. 'typical homemade lasagna'.",
                  },
                },
                required: ["name", "grams", "source"],
              },
            },
          },
          required: ["items"],
        },
      },
      {
        name: "draft_workout",
        description:
          "Create an UNSAVED workout draft for the user to review. Does not write data. Weight is in the user's units.",
        parameters: {
          type: "OBJECT",
          properties: {
            exercises: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  exerciseId: { type: "STRING", description: "From find_exercise; omit for a new exercise." },
                  name: { type: "STRING" },
                  sets: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        reps: { type: "INTEGER" },
                        weight: { type: "NUMBER" },
                      },
                      required: ["reps", "weight"],
                    },
                  },
                },
                required: ["name", "sets"],
              },
            },
          },
          required: ["exercises"],
        },
      },
      {
        name: "get_nutrition_summary",
        description: "The user's daily calorie and macro averages over recent days, compared with their goals.",
        parameters: {
          type: "OBJECT",
          properties: { days: { type: "INTEGER", description: "1-30, default 7." } },
          required: ["days"],
        },
      },
      {
        name: "get_progress",
        description: "Weekly trend for one exercise: best set and total volume per week.",
        parameters: {
          type: "OBJECT",
          properties: {
            exerciseId: { type: "STRING" },
            weeks: { type: "INTEGER", description: "1-26, default 8." },
          },
          required: ["exerciseId"],
        },
      },
    ],
  },
];

// ---- Zod schemas for validating Gemini's tool arguments ----

export const EstimatePer100g = z.object({
  kcal: z.number().min(0).max(900),
  protein_g: z.number().min(0).max(100),
  carbs_g: z.number().min(0).max(100),
  fat_g: z.number().min(0).max(100),
});

export const MealItemArgs = z
  .object({
    name: z.string().min(1).max(100),
    grams: z.number().positive().max(3000),
    source: z.enum(["usda", "estimate"]),
    fdcId: z.number().int().positive().optional(),
    estimatePer100g: EstimatePer100g.optional(),
    estimateBasis: z.string().min(3).max(200).optional(),
  })
  .superRefine((item, ctx) => {
    if (item.source === "usda" && item.fdcId === undefined) {
      ctx.addIssue({ code: "custom", message: `${item.name}: fdcId is required when source is "usda"` });
    }
    if (item.source === "estimate" && (!item.estimatePer100g || !item.estimateBasis)) {
      ctx.addIssue({
        code: "custom",
        message: `${item.name}: estimatePer100g and estimateBasis are required when source is "estimate"`,
      });
    }
  });

export const ToolArgs = {
  search_foods: z.object({ query: z.string().min(1).max(100) }),
  find_exercise: z.object({ name: z.string().min(1).max(100) }),
  draft_meal: z.object({ items: z.array(MealItemArgs).min(1).max(30) }),
  draft_workout: z.object({
    exercises: z
      .array(
        z.object({
          exerciseId: z.string().optional(),
          name: z.string().min(1).max(100),
          sets: z
            .array(z.object({ reps: z.number().int().min(1).max(100), weight: z.number().min(0).max(1500) }))
            .min(1)
            .max(30),
        }),
      )
      .min(1)
      .max(20),
  }),
  get_nutrition_summary: z.object({ days: z.number().int().min(1).max(30) }),
  get_progress: z.object({ exerciseId: z.string().min(1), weeks: z.number().int().min(1).max(26).default(8) }),
} as const;

export type ToolName = keyof typeof ToolArgs;
