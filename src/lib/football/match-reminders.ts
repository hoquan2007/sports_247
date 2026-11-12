import type { FootballMatch } from "./types";

export const REMINDER_SETTINGS_KEY = "sports247:reminder-settings";
export const REMINDER_SENT_KEY = "sports247:reminders-sent";
export type ReminderLeadMinutes = 15 | 30 | 60;
export type ReminderSettings = { enabled: boolean; minutesBefore: ReminderLeadMinutes };

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: false, minutesBefore: 30 };
const VIETNAM_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
});

/** Matchday is based on Vietnam time, including the hour before midnight. */
export function reminderWindowSpansNextDay(nowMs: number, lead: ReminderLeadMinutes): boolean {
  if (!Number.isFinite(nowMs)) return false;
  return VIETNAM_DAY_FORMATTER.format(new Date(nowMs)) !==
    VIETNAM_DAY_FORMATTER.format(new Date(nowMs + lead * 60_000));
}

export function parseReminderSettings(raw: string | null): ReminderSettings {
  if (!raw || raw.length > 1000) return DEFAULT_REMINDER_SETTINGS;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_REMINDER_SETTINGS;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.enabled !== "boolean" || typeof candidate.minutesBefore !== "number" ||
      ![15, 30, 60].includes(candidate.minutesBefore)) {
      return DEFAULT_REMINDER_SETTINGS;
    }
    return { enabled: candidate.enabled, minutesBefore: Number(candidate.minutesBefore) as ReminderLeadMinutes };
  } catch { return DEFAULT_REMINDER_SETTINGS; }
}

export function reminderKey(match: FootballMatch, lead: ReminderLeadMinutes): string {
  return `${match.id}|${match.startTime}|${lead}`;
}

export function dueMatchReminders(matches: readonly FootballMatch[], favorites: readonly string[],
  lead: ReminderLeadMinutes, nowMs: number): FootballMatch[] {
  const saved = new Set(favorites);
  if (!Number.isFinite(nowMs)) return [];
  const seen = new Set<string>();
  return matches.filter((match) => {
    if (match.status !== "scheduled" || !saved.has(match.id)) return false;
    const kickoff = Date.parse(match.startTime);
    if (!Number.isFinite(kickoff) || kickoff <= nowMs || kickoff - nowMs > lead * 60_000) return false;
    const key = reminderKey(match, lead);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type SentReminder = { key: string; kickoff: number };

function parseSentReminders(raw: string | null, nowMs: number): SentReminder[] {
  if (!raw || raw.length > 200_000) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SentReminder =>
      item !== null && typeof item === "object" && typeof item.key === "string" && item.key.length <= 300 &&
      typeof item.kickoff === "number" && Number.isFinite(item.kickoff) &&
      item.kickoff >= nowMs - 48 * 3_600_000 && item.kickoff <= nowMs + 366 * 86_400_000
    ).slice(-500);
  } catch { return []; }
}

/** Returns false when this exact match, kickoff and lead was already announced. */
export function markReminderSent(storage: Pick<Storage, "getItem" | "setItem">,
  match: FootballMatch, lead: ReminderLeadMinutes, nowMs: number): boolean {
  const key = reminderKey(match, lead);
  const kickoff = Date.parse(match.startTime);
  if (!Number.isFinite(kickoff)) return false;
  try {
    const entries = parseSentReminders(storage.getItem(REMINDER_SENT_KEY), nowMs);
    if (entries.some((entry) => entry.key === key)) return false;
    storage.setItem(REMINDER_SENT_KEY, JSON.stringify([...entries, { key, kickoff }].slice(-500)));
    return true;
  } catch {
    // Keep reminders usable in the current tab when storage is unavailable.
    return true;
  }
}
