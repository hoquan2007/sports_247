import type { MatchStatus } from "./types";

type EspnStatus = {
  displayClock?: string;
  type?: { name?: string; state?: string; shortDetail?: string };
};

/** ESPN's lifecycle state alone cannot distinguish a cancelled fixture from a final score. */
export function normalizeEspnStatus(value: EspnStatus | undefined): { status: MatchStatus; detail: string } {
  // Upstream JSON can contain incorrectly typed optional fields; never let a
  // malformed status crash a scoreboard or the licensed-video lookup.
  const kind = typeof value?.type?.name === "string" ? value.type.name.toUpperCase() : "";
  const state = typeof value?.type?.state === "string" ? value.type.state : undefined;
  if (kind === "STATUS_POSTPONED") return { status: "postponed", detail: "Hoãn" };
  if (kind === "STATUS_CANCELED" || kind === "STATUS_CANCELLED") {
    return { status: "cancelled", detail: "Đã hủy" };
  }
  if (["STATUS_SUSPENDED", "STATUS_INTERRUPTED", "STATUS_DELAYED", "STATUS_ABANDONED"].includes(kind)) {
    return { status: "interrupted", detail: "Gián đoạn" };
  }
  if (state === "in") {
    const clock = typeof value?.displayClock === "string" ? value.displayClock : "";
    const fallback = typeof value?.type?.shortDetail === "string" ? value.type.shortDetail : "";
    return { status: "live", detail: clock || fallback || "LIVE" };
  }
  if (state === "post" || kind === "STATUS_FINAL") return { status: "finished", detail: "FT" };
  return { status: "scheduled", detail: "Sắp diễn ra" };
}
