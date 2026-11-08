"use client";

import { useState } from "react";
import Image from "next/image";
import { VIETNAM_TIMEZONE } from "@/lib/football/leagues";
import { teamLogoImageUrl } from "@/lib/football/team-logo";
import type { FootballTeam, MatchStatus } from "@/lib/football/types";

const TIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  timeZone: VIETNAM_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false,
});

export function timeOf(value: string) {
  return TIME_FORMATTER.format(new Date(value));
}
export function dateOf(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VIETNAM_TIMEZONE, day: "2-digit", month: "long", year: "numeric", ...options,
  }).format(new Date(value));
}

export function labelForStatus(status: MatchStatus) {
  return status === "live" ? "Đang diễn ra" : status === "finished" ? "Kết thúc"
    : status === "postponed" ? "Hoãn" : status === "cancelled" ? "Đã hủy"
    : status === "interrupted" ? "Gián đoạn" : status === "awarded" ? "Kết quả hành chính" : "Chưa bắt đầu";
}

export function TeamBadge({ team, size = 32, eager = false }: { team: FootballTeam; size?: number; eager?: boolean }) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const bad = brokenUrl === team.logo;
  const useResponsiveCdn = eager && team.logo !== null && teamLogoImageUrl(team.logo, size) !== team.logo;
  return (
    <span className="team-badge" style={{ width: size, height: size }} aria-hidden="true">
      {team.logo && !bad ? (
        <Image src={useResponsiveCdn ? team.logo : teamLogoImageUrl(team.logo, size)} alt="" width={size} height={size}
          loader={useResponsiveCdn ? ({ src, width }) => teamLogoImageUrl(src, width, 1) : undefined}
          unoptimized={!eager}
          sizes={eager ? "(max-width: 370px) 50px, (max-width: 690px) 56px, (max-width: 980px) 72px, 78px" : undefined}
          loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "low"}
          onError={() => setBrokenUrl(team.logo)} className="team-image" />
      ) : (
        <span className="team-initials">{team.shortName.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

export function LiveMark({ compact = false }: { compact?: boolean }) {
  return <span className="live-mark"><i className="live-dot" />{compact ? "LIVE" : "Đang trực tiếp"}</span>;
}
