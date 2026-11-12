"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, ChartNoAxesColumn, Expand, RefreshCw, X } from "lucide-react";
import { LeagueBadge } from "@/components/league-badge";
import { LEAGUES } from "@/lib/football/leagues";
import { teamLogoImageUrl } from "@/lib/football/team-logo";
import { STANDINGS_LEAGUES, type StandingFeed, type StandingEntry } from "@/lib/football/standings";

const AVAILABLE = LEAGUES.filter((league) => STANDINGS_LEAGUES.some((id) => id === league.id));

function StandingTeam({ entry }: { entry: StandingEntry }) {
  const [broken, setBroken] = useState<string | null>(null);
  return <span className="standings-team" title={entry.name}>
    {entry.logo && entry.logo !== broken
      ? <Image src={teamLogoImageUrl(entry.logo, 21)} width={21} height={21} unoptimized alt="" onError={() => setBroken(entry.logo)} />
      : <span className="standings-team-fallback" aria-hidden="true">{entry.name.slice(0, 2).toUpperCase()}</span>}
    <span>{entry.name}</span>
  </span>;
}

function StandingsTable({ entries, full = false }: { entries: StandingEntry[]; full?: boolean }) {
  return <table className={`standings-table ${full ? "standings-table-full" : ""}`}>
    <thead><tr><th scope="col">#</th><th scope="col">Đội</th><th scope="col" title="Trận đã đấu">Tr</th>
      {full && <><th scope="col" title="Thắng">T</th><th scope="col" title="Hòa">H</th><th scope="col" title="Bại">B</th></>}
      <th scope="col" title="Hiệu số bàn thắng">HS</th><th scope="col" title="Điểm">Đ</th>
    </tr></thead>
    <tbody>{entries.map((entry, index) => <tr key={entry.id}>
      <td className="mono">{entry.rank ?? index + 1}</td>
      <td><StandingTeam entry={entry} /></td>
      <td className="mono">{entry.played ?? "–"}</td>
      {full && <><td className="mono">{entry.wins ?? "–"}</td><td className="mono">{entry.draws ?? "–"}</td><td className="mono">{entry.losses ?? "–"}</td></>}
      <td className="mono">{entry.goalDifference ?? "–"}</td><td className="mono standings-points">{entry.points ?? "–"}</td>
    </tr>)}</tbody>
  </table>;
}

export function LeagueStandings({ leagueId }: { leagueId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState(() => STANDINGS_LEAGUES.some((id) => id === leagueId) ? leagueId : "eng.1");
  const [groupIndex, setGroupIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<StandingFeed | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/standings?league=${encodeURIComponent(chosen)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json() as StandingFeed;
        if (!controller.signal.aborted) { setData(result); setError(false); setLoading(false); }
      } catch {
        if (!controller.signal.aborted) { setData(null); setError(true); setLoading(false); }
      }
    }
    void load();
    return () => controller.abort();
  }, [chosen, retry]);

  const group = data?.groups[groupIndex] ?? data?.groups[0];
  const rows = group?.entries.slice(0, 6) ?? [];
  const groupCaption = group?.name && group.name === data?.season
    ? group.name
    : [group?.name, data?.season].filter(Boolean).join(" · ");
  const openFullTable = () => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    setExpanded(true);
  };
  return <section className="sidebar-card standings-card" aria-labelledby="standings-heading">
    <div className="aside-heading"><div><span className="eyebrow">Thứ hạng các đội</span><h3 id="standings-heading">Bảng xếp hạng</h3></div><ChartNoAxesColumn size={18} /></div>
    <label className="standings-select-label" htmlFor="standings-league">Chọn giải đấu</label>
    <div className="standings-picker"><LeagueBadge leagueId={chosen} size={30} />
      <select id="standings-league" value={chosen} onChange={(event) => { setChosen(event.target.value); setGroupIndex(0); setExpanded(false); setData(null); setLoading(true); }}>
        {AVAILABLE.map((league) => <option value={league.id} key={league.id}>{league.name}</option>)}
      </select>
    </div>
    {rows.length ? <>
      {data && data.groups.length > 1 && <label className="standings-group-picker" htmlFor="standings-group">
        <span>Chọn bảng</span>
        <select id="standings-group" value={groupIndex} onChange={(event) => { setGroupIndex(Number(event.target.value)); setExpanded(false); }}>
          {data.groups.map((item, index) => <option key={`${item.name}-${index}`} value={index}>{item.name}</option>)}
        </select>
      </label>}
      <div className="standings-group-label">{groupCaption}</div>
      <div className="standings-table-wrap"><StandingsTable entries={rows} /></div>
      {(group?.entries.length ?? 0) > 6 && <button className="standings-expand" type="button" aria-expanded={expanded} aria-controls="standings-full-dialog" onClick={openFullTable}>
        Xem toàn bộ {group?.entries.length} đội <Expand size={15} />
      </button>}
      <a className="standings-link" href={`https://www.espn.com/soccer/standings/_/league/${chosen}`} target="_blank" rel="noopener noreferrer">
        Xem bảng đầy đủ trên ESPN <ArrowUpRight size={15} />
      </a>
    </> : <div className="standings-empty" role="status">{loading ? <><RefreshCw className="spinning" size={16} /> Đang tải bảng xếp hạng...</>
      : error ? <>Không tải được bảng xếp hạng. <button onClick={() => { setLoading(true); setRetry((n) => n + 1); }}>Thử lại</button></>
        : "Giải này chưa có bảng xếp hạng từ ESPN."}</div>}
    <p className="standings-credit">Thống kê từ ESPN; các giải đấu loại trực tiếp có thể không có bảng xếp hạng.</p>
    <dialog ref={dialogRef} id="standings-full-dialog" className="standings-dialog" aria-labelledby="standings-dialog-heading" onClose={() => setExpanded(false)}>
      <div className="standings-dialog-head">
        <div><span className="eyebrow">BẢNG XẾP HẠNG · ESPN</span>
          <h2 id="standings-dialog-heading"><LeagueBadge leagueId={chosen} size={35} /> {AVAILABLE.find((item) => item.id === chosen)?.name}</h2>
          {data?.season && <p>Mùa giải {data.season}</p>}
        </div>
        <button type="button" className="standings-dialog-close" aria-label="Đóng bảng xếp hạng" onClick={() => dialogRef.current?.close()}><X size={19} /></button>
      </div>
      {(data?.groups.length ?? 0) > 1 && <label className="standings-dialog-group" htmlFor="standings-dialog-group-select">Chọn bảng
        <select id="standings-dialog-group-select" value={groupIndex} onChange={(event) => setGroupIndex(Number(event.target.value))}>
          {data?.groups.map((item, index) => <option key={`${item.name}-${index}`} value={index}>{item.name}</option>)}
        </select>
      </label>}
      <div className="standings-dialog-scroll" tabIndex={0} role="region" aria-label="Bảng điểm đầy đủ; cuộn ngang để xem các cột trên điện thoại">
        <StandingsTable entries={group?.entries ?? []} full />
      </div>
      <p className="standings-dialog-note">{groupCaption} · Cuộn ngang để xem đủ số liệu trên màn hình nhỏ.</p>
    </dialog>
  </section>;
}
