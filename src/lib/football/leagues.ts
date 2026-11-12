export interface League {
  id: string;
  name: string;
  country: string;
  short: string;
  logo: string;
}

// From the corresponding ESPN soccer scoreboard `leagues[0].logos[0].href`
// verified on 2026-10-31. Brand assets remain the property of their owners.
const espnLogo = (id: number) => `https://a.espncdn.com/i/leaguelogos/soccer/500/${id}.png`;

export const LEAGUES: League[] = [
  { id: "eng.1", name: "Premier League", country: "Anh", short: "EPL", logo: espnLogo(23) },
  { id: "esp.1", name: "La Liga", country: "Tây Ban Nha", short: "LAL", logo: espnLogo(15) },
  { id: "ger.1", name: "Bundesliga", country: "Đức", short: "BUN", logo: espnLogo(10) },
  { id: "ita.1", name: "Serie A", country: "Ý", short: "ITA", logo: espnLogo(12) },
  { id: "fra.1", name: "Ligue 1", country: "Pháp", short: "FRA", logo: espnLogo(9) },
  { id: "uefa.champions", name: "Champions League", country: "Châu Âu", short: "UCL", logo: espnLogo(2) },
  { id: "uefa.europa", name: "Europa League", country: "Châu Âu", short: "UEL", logo: espnLogo(2310) },
  { id: "uefa.nations", name: "UEFA Nations League", country: "Châu Âu", short: "UNL", logo: espnLogo(2395) },
  { id: "eng.2", name: "Championship", country: "Anh", short: "ECH", logo: espnLogo(24) },
  { id: "usa.1", name: "MLS", country: "Mỹ", short: "MLS", logo: espnLogo(19) },
  { id: "eng.fa", name: "FA Cup", country: "Anh", short: "FAC", logo: espnLogo(40) },
  { id: "fifa.world", name: "FIFA World Cup", country: "Thế giới", short: "WC", logo: espnLogo(4) },
  { id: "uefa.europa.conf", name: "Conference League", country: "Châu Âu", short: "UECL", logo: espnLogo(20296) },
  { id: "por.1", name: "Primeira Liga", country: "Bồ Đào Nha", short: "POR", logo: espnLogo(14) },
  { id: "ned.1", name: "Eredivisie", country: "Hà Lan", short: "NED", logo: espnLogo(11) },
  { id: "ksa.1", name: "Saudi Pro League", country: "Ả Rập Xê Út", short: "SAU", logo: espnLogo(2488) },
  { id: "afc.champions", name: "AFC Champions League Elite", country: "Châu Á", short: "AFC", logo: espnLogo(2200) },
  { id: "afc.asian.cup", name: "AFC Asian Cup", country: "Châu Á", short: "ACUP", logo: espnLogo(2243) },
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

export function shiftMonth(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 0)).getUTCDate();
  firstDay.setUTCDate(Math.min(day, lastDay));
  return firstDay.toISOString().slice(0, 10);
}
