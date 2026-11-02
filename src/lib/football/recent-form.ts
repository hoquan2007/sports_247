export type FormOutcome = "W" | "D" | "L";

/** ESPN competitor.form is optional and may contain separators. Only accept recorded results. */
export function parseRecentForm(raw: unknown): FormOutcome[] {
  if (typeof raw !== "string") return [];
  const value = raw.trim().toUpperCase().replace(/[\s,\-/]/g, "");
  if (!/^[WDL]{1,5}$/.test(value)) return [];
  return value.split("") as FormOutcome[];
}
