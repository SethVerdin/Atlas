// The app sends its IANA time zone so "today" and meal names follow the user's clock.

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD in the given zone. */
export function localDateKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function localHour(d: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(d));
}

export function formatClock(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(d);
}

export type MealSlot = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export function mealSlot(d: Date, timeZone: string): MealSlot {
  const h = localHour(d, timeZone);
  if (h >= 4 && h < 11) return "Breakfast";
  if (h >= 11 && h < 16) return "Lunch";
  if (h >= 16 && h < 21) return "Dinner";
  return "Snack";
}

/** "Today", "Yesterday", or "Oct 7". */
export function relativeDay(d: Date, timeZone: string, now = new Date()): string {
  const key = localDateKey(d, timeZone);
  if (key === localDateKey(now, timeZone)) return "Today";
  if (key === localDateKey(new Date(now.getTime() - 86_400_000), timeZone)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(d);
}
