export interface League {
  id: string;
  name: string;
  country: string;
  short: string;
}

export const LEAGUES: League[] = [
  { id: "eng.1", name: "Premier League", country: "Anh", short: "EPL" },
  { id: "esp.1", name: "La Liga", country: "Tây Ban Nha", short: "LAL" },
  { id: "ger.1", name: "Bundesliga", country: "Đức", short: "BUN" },
  { id: "ita.1", name: "Serie A", country: "Ý", short: "ITA" },
  { id: "fra.1", name: "Ligue 1", country: "Pháp", short: "FRA" },
  { id: "uefa.champions", name: "Champions League", country: "Châu Âu", short: "UCL" },
  { id: "uefa.europa", name: "Europa League", country: "Châu Âu", short: "UEL" },
  { id: "eng.2", name: "Championship", country: "Anh", short: "ECH" },
  { id: "usa.1", name: "MLS", country: "Mỹ", short: "MLS" },
];

export const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";

export function vietnamDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: VIETNAM_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
