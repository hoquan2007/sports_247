"use client";

import { useState } from "react";
import Image from "next/image";
import { LEAGUES } from "@/lib/football/leagues";
import { VIETNAM_LEAGUES } from "@/lib/football/vietnam-leagues";

/** Displays the official competition crest, including a legible offline fallback. */
export function LeagueBadge({ leagueId, size = 32, className = "" }: {
  leagueId: string;
  size?: number;
  className?: string;
}) {
  const league = [...LEAGUES, ...VIETNAM_LEAGUES].find((item) => item.id === leagueId);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const logo = league?.logo ?? null;
  const vietnamPreview = leagueId === "vie.1" || leagueId === "vie.2";

  return <span className={`league-badge ${className}`} style={{ width: size, height: size }}
    role="img" aria-label={`Logo ${league?.name ?? "giải đấu"}`} data-league-id={leagueId}>
    {logo && logo !== failedLogo ? (
      <Image src={logo} width={size} height={size} alt="" className={`league-badge-image${vietnamPreview ? " league-badge-image-vietnam" : ""}`}
        unoptimized onError={() => setFailedLogo(logo)} />
    ) : <span className="league-badge-fallback" aria-hidden="true">{league?.short.slice(0, 3) ?? "FC"}</span>}
  </span>;
}
