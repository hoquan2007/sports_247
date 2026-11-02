/** Public competition metadata; safe for client components. */
export const VIETNAM_LEAGUES = [
  { id: "vie.1", name: "V.League 1", country: "Việt Nam", short: "VL1",
    logo: "https://vpf.vn/wp-content/uploads/2026/09/Thumb-VL1.jpg",
    officialUrl: "https://vpf.vn/mobile/" },
  { id: "vie.2", name: "V.League 2", country: "Việt Nam", short: "VL2",
    logo: "https://vpf.vn/wp-content/uploads/2026/09/LOGOVLEAGUE2_THUMBNAIL_2026_27.png",
    officialUrl: "https://vpf.vn/mobile/" },
] as const;

export type VietnamLeagueId = (typeof VIETNAM_LEAGUES)[number]["id"];
export const isVietnamLeague = (id: string): id is VietnamLeagueId =>
  VIETNAM_LEAGUES.some((league) => league.id === id);
