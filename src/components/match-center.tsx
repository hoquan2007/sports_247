"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  Activity, ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, ExternalLink, Heart, Info, MapPin, Radio, RefreshCw,
  Search, Star, Trophy, Tv, X,
} from "lucide-react";
import { BallLoading, MatchdayIntro, MatchdayMascot } from "@/components/matchday-motion";
import { detectGoalEvent, type GoalEvent } from "@/lib/football/goal-event";
import { reconcileFeed } from "@/lib/football/feed-state";
import { LEAGUES, shiftDate, vietnamDate, VIETNAM_TIMEZONE } from "@/lib/football/leagues";
import type { FootballMatch, FootballTeam, MatchFeed, MatchStatus } from "@/lib/football/types";

type StatusFilter = "all" | MatchStatus;
gsap.registerPlugin(useGSAP);
const COMPETITION_ORDER = new Map(LEAGUES.map((league, index) => [league.id, index]));

function timeOf(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VIETNAM_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}
function dateOf(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VIETNAM_TIMEZONE, day: "2-digit", month: "long", year: "numeric", ...options,
  }).format(new Date(value));
}
function dayLabel(date: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC", weekday: "short" })
    .format(new Date(`${date}T12:00:00Z`));
}
function labelForStatus(status: MatchStatus) {
  return status === "live" ? "Đang diễn ra" : status === "finished" ? "Kết thúc" : "Chưa bắt đầu";
}

function TeamBadge({ team, size = 32 }: { team: FootballTeam; size?: number }) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const bad = brokenUrl === team.logo;
  return (
    <span className="team-badge" style={{ width: size, height: size }} aria-hidden="true">
      {team.logo && !bad ? (
        <Image src={team.logo} alt="" width={size} height={size} unoptimized
          onError={() => setBrokenUrl(team.logo)} className="team-image" />
      ) : (
        <span className="team-initials">{team.shortName.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

function LiveMark({ compact = false }: { compact?: boolean }) {
  return <span className="live-mark"><i className="live-dot" />{compact ? "LIVE" : "Đang trực tiếp"}</span>;
}

function MatchRow({ match, saved, onSave, onOpen }: {
  match: FootballMatch; saved: boolean; onSave: () => void; onOpen: () => void;
}) {
  return (
    <div className={`match-row ${match.status === "live" ? "is-live" : ""}`}>
      <button className="match-open" onClick={onOpen} aria-label={`Xem chi tiết ${match.home.name} - ${match.away.name}`}>
        <div className="match-clock">
          {match.status === "live" ? <span className="match-minute">{match.statusDetail}</span> : (
            <span className="mono">{match.status === "finished" ? "FT" : timeOf(match.startTime)}</span>
          )}
          <small>{match.status === "live" ? "LIVE" : match.status === "finished" ? "Kết thúc" : "GMT+7"}</small>
        </div>
        <div className="match-teams">
          <div className="match-team"><TeamBadge team={match.home} size={27} /><span>{match.home.name}</span></div>
          <div className="match-team"><TeamBadge team={match.away} size={27} /><span>{match.away.name}</span></div>
        </div>
        <div className={`match-scores ${match.status === "live" ? "scores-live" : ""}`}>
          <span>{match.homeScore ?? "–"}</span><span>{match.awayScore ?? "–"}</span>
        </div>
        <div className="match-broadcast">{match.broadcasters[0] ?? (match.venue ? match.venue : "Chi tiết trận đấu")}</div>
        <ChevronRight className="row-chevron" size={16} />
      </button>
      <button className={`save-button ${saved ? "saved" : ""}`}
        onClick={onSave} aria-label={saved ? "Bỏ lưu trận đấu" : "Lưu trận đấu"}
        title={saved ? "Bỏ yêu thích" : "Thêm yêu thích"}>
        <Star size={18} fill={saved ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

function MatchDialog({ match, onClose }: { match: FootballMatch; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="match-dialog" role="dialog" aria-modal="true" aria-label={`Chi tiết ${match.home.name} - ${match.away.name}`}>
        <div className="dialog-topline">
          <span className="eyebrow">TRUNG TÂM TRẬN ĐẤU <span className="dialog-separator">/</span> {match.leagueName}</span>
          <button onClick={onClose} className="icon-button" aria-label="Đóng"><X size={20} /></button>
        </div>
        <p className="dialog-datetime">{dateOf(match.startTime)} · {timeOf(match.startTime)} (GMT+7)</p>
        <div className="dialog-scoreline">
          <div className="dialog-team"><TeamBadge team={match.home} size={76} /><strong>{match.home.name}</strong><small>Chủ nhà</small></div>
          <div className="dialog-score">
            {match.status === "live" && <LiveMark compact />}
            <span className="mono">{match.homeScore ?? "–"} <em>:</em> {match.awayScore ?? "–"}</span>
            <small>{labelForStatus(match.status)}{match.status === "live" ? ` · ${match.statusDetail}` : ""}</small>
          </div>
          <div className="dialog-team"><TeamBadge team={match.away} size={76} /><strong>{match.away.name}</strong><small>Đội khách</small></div>
        </div>
        <div className="dialog-facts">
          <div><MapPin size={18} /><span><small>Sân vận động</small><strong>{match.venue ?? "Chưa công bố"}</strong></span></div>
          <div><Tv size={18} /><span><small>Kênh phát sóng được ghi nhận</small><strong>{match.broadcasters.join(", ") || "Chưa có thông tin bản quyền tại Việt Nam"}</strong></span></div>
          <div><Activity size={18} /><span><small>Nguồn tỷ số / lịch</small><strong>{match.source}</strong></span></div>
        </div>
        <p className="broadcast-note">Thông tin phát sóng có thể dành cho thị trường khác. Để xem video trực tiếp, hãy sử dụng nền tảng sở hữu bản quyền tại khu vực của bạn.</p>
        {match.matchUrl && (
          <a className="dialog-link" href={match.matchUrl} target="_blank" rel="noopener noreferrer">
            Xem thông tin trận tại ESPN <ExternalLink size={17} />
          </a>
        )}
      </section>
    </div>
  );
}

function featuredMatches(matches: FootballMatch[], limit: number): FootballMatch[] {
  const names = ["Liverpool", "Arsenal", "Manchester United", "Chelsea", "Manchester City", "Barcelona", "Real Madrid", "Bayern", "Dortmund", "Inter", "Milan", "Paris Saint-Germain", "Juventus"];
  const rank = (match: FootballMatch) =>
    (match.status === "live" ? 100 : match.status === "scheduled" ? 20 : 0) +
    [match.home.name, match.away.name].filter((name) => names.some((club) => name.includes(club))).length * 12;
  return [...matches].sort((a, b) => rank(b) - rank(a)).slice(0, limit);
}

function MatchSpotlight({ matches, onOpen }: { matches: FootballMatch[]; onOpen: (match: FootballMatch) => void }) {
  const rootRef = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const prioritized = useMemo(() => featuredMatches(matches, 6), [matches]);
  const active = prioritized[index % prioritized.length];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduceMotion(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    if (paused || reduceMotion || prioritized.length < 2) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndex((value) => (value + 1) % prioritized.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [paused, reduceMotion, prioritized.length]);
  useGSAP(() => {
    if (reduceMotion) return;
    gsap.fromTo(".spotlight-body > *", { autoAlpha: 0, y: 12, scale: .985 },
      { autoAlpha: 1, y: 0, scale: 1, stagger: .07, duration: .45, ease: "power2.out", clearProps: "all" });
  }, { scope: rootRef, dependencies: [index, reduceMotion, active?.id] });

  if (!active) return (
    <section className="spotlight spotlight-empty" aria-label="Trận nổi bật">
      <div className="spotlight-stadium" aria-hidden="true" />
      <div className="spotlight-empty-content"><span className="spotlight-kicker">Matchday / SPORTS247</span><h2>Đón chờ trận cầu tiếp theo.</h2><p>Đổi ngày để xem lịch thi đấu.</p></div>
    </section>
  );
  const move = (step: number) => setIndex((value) => (value + step + prioritized.length) % prioritized.length);
  return (
    <section className="spotlight" ref={rootRef} aria-roledescription="carousel" aria-label="Các trận đấu nổi bật" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <div className="spotlight-stadium" aria-hidden="true"><div className="spotlight-pitch" /><div className="spotlight-light spotlight-light-a" /><div className="spotlight-light spotlight-light-b" /></div>
      <div className="spotlight-top">
        <span className="spotlight-kicker"><span className="spotlight-signal" /> {active.status === "live" ? "Đang diễn ra" : "Trận cầu nổi bật"}</span>
        <span className="spotlight-competition">{active.leagueName}</span>
      </div>
      <div className="spotlight-body" aria-live="off">
        <div className="spotlight-club">
          <div className="spotlight-crest"><TeamBadge team={active.home} size={104} /></div>
          <strong>{active.home.name}</strong><span>Chủ nhà</span>
        </div>
        <div className="spotlight-center">
          <span className={`spotlight-status ${active.status === "live" ? "is-live" : ""}`}>{active.status === "live" ? active.statusDetail : active.status === "finished" ? "Kết thúc" : "Giờ bóng lăn"}</span>
          <strong className="spotlight-score mono" key={`${active.id}-${active.homeScore}-${active.awayScore}`}>
            {active.status === "scheduled" ? timeOf(active.startTime) : `${active.homeScore ?? "–"} : ${active.awayScore ?? "–"}`}
          </strong>
          <span className="spotlight-date">{dateOf(active.startTime, { year: undefined })} · GMT+7</span>
          <button className="spotlight-open" onClick={() => onOpen(active)}>Chi tiết trận đấu <ArrowUpRight size={16} /></button>
        </div>
        <div className="spotlight-club">
          <div className="spotlight-crest"><TeamBadge team={active.away} size={104} /></div>
          <strong>{active.away.name}</strong><span>Đội khách</span>
        </div>
      </div>
      <div className="spotlight-bottom">
        <span className="spotlight-location"><MapPin size={14} /> {active.venue ?? "Địa điểm chưa công bố"}</span>
        <div className="spotlight-controls" aria-label="Chuyển trận nổi bật">
          <button aria-label="Trận trước" onClick={() => move(-1)}><ChevronLeft size={19} /></button>
          <span className="spotlight-count mono">{String((index % prioritized.length) + 1).padStart(2, "0")} / {String(prioritized.length).padStart(2, "0")}</span>
          <button aria-label="Trận tiếp theo" onClick={() => move(1)}><ChevronRight size={19} /></button>
        </div>
      </div>
      {!reduceMotion && !paused && prioritized.length > 1 && <div className="spotlight-progress" key={index} aria-hidden="true" />}
    </section>
  );
}

export function MatchCenter({ initialFeed }: { initialFeed: MatchFeed }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState(initialFeed.date);
  const [feed, setFeed] = useState(initialFeed);
  const [league, setLeague] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [focusedMatch, setFocusedMatch] = useState<FootballMatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstLoad = useRef(true);
  const [clockNow, setClockNow] = useState<Date | null>(null);
  const [goalEvent, setGoalEvent] = useState<GoalEvent | null>(null);
  const previousSnapshot = useRef({ date: initialFeed.date, matches: initialFeed.matches, complete: !initialFeed.partial });
  const latestFeedRef = useRef<MatchFeed>(initialFeed);
  const activeDateRef = useRef(initialFeed.date);
  const latestRequestRef = useRef(0);

  useEffect(() => {
    if (!goalEvent) return;
    const id = window.setTimeout(() => setGoalEvent(null), 7000);
    return () => window.clearTimeout(id);
  }, [goalEvent]);

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(".section-heading, .score-ticker, .date-panel", {
      y: 16, opacity: 0,
    }, {
      y: 0, opacity: 1, duration: 0.7, stagger: 0.095, ease: "power2.out",
      clearProps: "opacity,transform",
    });
  }, { scope: containerRef });

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("sports247:favorites") ?? "[]") as unknown;
      if (Array.isArray(stored)) setFavorites(stored.filter((x): x is string => typeof x === "string"));
    } catch { /* Corrupted old storage should not prevent rendering. */ }
  }, []);
  useEffect(() => {
    const tick = () => setClockNow(new Date());
    tick();
    const timer = window.setInterval(tick, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const retrieve = useCallback(async (date: string, signal: AbortSignal, silent: boolean) => {
    const requestId = ++latestRequestRef.current;
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/matches?date=${encodeURIComponent(date)}`, { signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as MatchFeed;
      if (!signal.aborted && requestId === latestRequestRef.current && date === activeDateRef.current && data.date === date) {
        if (previousSnapshot.current.date === data.date && data.date === date && previousSnapshot.current.complete && !data.partial) {
          const goal = detectGoalEvent(previousSnapshot.current.matches, data.matches);
          if (goal) setGoalEvent(goal);
        }
        const merged = reconcileFeed(latestFeedRef.current, data);
        latestFeedRef.current = merged;
        previousSnapshot.current = { date: merged.date, matches: merged.matches, complete: !data.partial };
        setFeed(merged); setError(null);
      }
    } catch (cause) {
      if (!signal.aborted && requestId === latestRequestRef.current && date === activeDateRef.current)
        setError(cause instanceof Error ? cause.message : "Không thể cập nhật dữ liệu");
    } finally {
      if (!signal.aborted && requestId === latestRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (firstLoad.current) firstLoad.current = false;
    else void retrieve(selectedDate, controller.signal, false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void retrieve(selectedDate, controller.signal, true);
    }, 90000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [selectedDate, retrieve]);

  const toggleFavorite = (id: string) => {
    setFavorites((old) => {
      const next = old.includes(id) ? old.filter((item) => item !== id) : [...old, id];
      localStorage.setItem("sports247:favorites", JSON.stringify(next));
      return next;
    });
  };
  const today = vietnamDate(clockNow ?? new Date());
  const games = useMemo(() => feed.date === selectedDate ? feed.matches : [], [feed, selectedDate]);
  const tickerGames = useMemo(() => featuredMatches(games, 8), [games]);
  const totals = useMemo(() => ({
    total: games.length,
    live: games.filter((m) => m.status === "live").length,
    finished: games.filter((m) => m.status === "finished").length,
    upcoming: games.filter((m) => m.status === "scheduled").length,
  }), [games]);
  const visible = useMemo(() => games.filter((m) =>
    (league === "all" || m.leagueId === league) &&
    (status === "all" || m.status === status) &&
    (!favoritesOnly || favorites.includes(m.id)) &&
    (`${m.home.name} ${m.away.name} ${m.leagueName}`.toLowerCase().includes(query.toLowerCase().trim()))
  ), [games, league, status, favoritesOnly, favorites, query]);

  const leagueGroups = useMemo(() => {
    const byLeague = new Map<string, FootballMatch[]>();
    visible.forEach((m) => byLeague.set(m.leagueId, [...(byLeague.get(m.leagueId) ?? []), m]));
    return [...byLeague.entries()].sort((a, b) =>
      (COMPETITION_ORDER.get(a[0]) ?? 99) - (COMPETITION_ORDER.get(b[0]) ?? 99)
    );
  }, [visible]);

  const dateTabs = Array.from({ length: 7 }, (_, i) => shiftDate(selectedDate, i - 3));
  const chooseDate = (day: string) => {
    activeDateRef.current = day;
    latestRequestRef.current++;
    setSelectedDate(day); setStatus("all"); setError(null); setGoalEvent(null);
  };
  const goToday = () => { setFavoritesOnly(false); setLeague("all"); setQuery(""); chooseDate(today); };
  const resetFilters = () => { setFavoritesOnly(false); setLeague("all"); setStatus("all"); setQuery(""); };
  const closeDialog = useCallback(() => setFocusedMatch(null), []);

  return (
    <div className="app-shell" ref={containerRef}>
      <MatchdayIntro />
      <div className="main-shell">
        <header className="site-header">
          <div className="header-identity">
            <button className="brand-wordmark" onClick={goToday} aria-label="Sports247 — về lịch hôm nay"><span>SPORTS</span><b>247</b><i className="wordmark-period" /></button>
          </div>
          <nav className="header-navigation" aria-label="Điều hướng chính">
            <button className={!favoritesOnly && status !== "live" ? "nav-link selected" : "nav-link"} onClick={goToday}>Lịch thi đấu</button>
            <button className={!favoritesOnly && status === "live" ? "nav-link selected" : "nav-link"} onClick={() => { setFavoritesOnly(false); setLeague("all"); setStatus("live"); }}>Trực tiếp {totals.live > 0 && <span className="nav-count">{totals.live}</span>}</button>
            <a className="nav-link" href="#competitions">Giải đấu</a>
          </nav>
          <div className="header-actions">
            <button className={favoritesOnly ? "favorites-link active" : "favorites-link"} onClick={() => setFavoritesOnly((current) => !current)} aria-pressed={favoritesOnly}><Heart size={17} fill={favoritesOnly ? "currentColor" : "none"} /> <span>Đã lưu</span></button>
            <span className="clock-label"><Clock3 size={14} /> {clockNow ? timeOf(clockNow.toISOString()) : "--:--"} <span>GMT+7</span></span>
            <span className="header-separator" />
            <button className="header-refresh" onClick={() => {
              const controller = new AbortController();
              void retrieve(selectedDate, controller.signal, false);
            }} aria-label="Làm mới tỷ số" title="Làm mới dữ liệu"><RefreshCw size={17} className={loading ? "spinning" : ""} /></button>
          </div>
        </header>

        <div className="score-ticker" aria-label="Tỷ số nhanh">
          <div className="ticker-label"><Radio size={15} /><strong>MATCH<br />CENTER</strong></div>
          <div className="ticker-events">
            {games.length ? <div className="ticker-track">
              {[0, 1].map((repeat) => <div className="ticker-set" key={repeat} aria-hidden={repeat === 1}>
                {tickerGames.map((m) => <button key={`${repeat}-${m.id}`} className="ticker-event" tabIndex={repeat === 1 ? -1 : 0} onClick={() => setFocusedMatch(m)}>
                  <small>{m.leagueName}</small>
                  <div><TeamBadge team={m.home} size={21} /><span>{m.home.shortName}</span><strong className="mono">{m.status === "scheduled" ? timeOf(m.startTime) : `${m.homeScore ?? "–"} : ${m.awayScore ?? "–"}`}</strong><span>{m.away.shortName}</span><TeamBadge team={m.away} size={21} /></div>
                </button>)}
              </div>)}
            </div> : <span className="ticker-empty">Chọn ngày để xem các trận đấu.</span>}
          </div>
        </div>

        <main className="workspace">
          <div className="section-heading">
            <div><span className="matchday-heading-kicker">Cùng nhịp bóng đá</span><h1>Match<span>day.</span></h1></div>
            <div className="update-indicator">
              <span className={`status-orb ${totals.live > 0 ? "pulsing" : ""}`} />
              {feed.partial ? "Một số nguồn đang gián đoạn" : "Kết nối dữ liệu"}
              <span className="update-stamp">Cập nhật lúc {timeOf(feed.updatedAt)}</span>
            </div>
          </div>

          <MatchSpotlight key={selectedDate} matches={games} onOpen={setFocusedMatch} />

          <div className="date-panel">
            <div className="date-panel-title"><CalendarDays size={17} /><span>Chọn ngày thi đấu</span></div>
            <button className="date-arrow" aria-label="Ngày trước" onClick={() => chooseDate(shiftDate(selectedDate, -1))}><ChevronLeft size={20} /></button>
            <div className="date-tabs">
              {dateTabs.map((day) => (
                <button key={day} className={`date-tab ${day === selectedDate ? "selected" : ""}`} onClick={() => chooseDate(day)}>
                  <span>{day === today ? "Hôm nay" : dayLabel(day)}</span>
                  <strong className="mono">{day.slice(8, 10)}/{day.slice(5, 7)}</strong>
                </button>
              ))}
            </div>
            <button className="date-arrow" aria-label="Ngày tiếp theo" onClick={() => chooseDate(shiftDate(selectedDate, 1))}><ChevronRight size={20} /></button>
            <button className="today-link" onClick={goToday}>Về hôm nay <ArrowUpRight size={14} /></button>
          </div>

          <div className="stats-strip">
            <div className="stat-box"><span>Tất cả trận</span><strong className="mono">{totals.total.toString().padStart(2, "0")}</strong><small>trong ngày</small></div>
            <div className="stat-box"><span>Trực tiếp</span><strong className="mono">{totals.live.toString().padStart(2, "0")}</strong><small>đang diễn ra</small></div>
            <div className="stat-box"><span>Sắp diễn ra</span><strong className="mono">{totals.upcoming.toString().padStart(2, "0")}</strong><small>chưa bắt đầu</small></div>
            <div className="stat-box"><span>Kết quả</span><strong className="mono">{totals.finished.toString().padStart(2, "0")}</strong><small>đã kết thúc</small></div>
          </div>

          <div className="content-grid">
            <section className="results-area" aria-label="Danh sách trận đấu">
              <div className="results-heading">
                <div><span className="eyebrow">Toàn bộ trận đấu</span><h2>{selectedDate === today ? "Hôm nay" : dateOf(`${selectedDate}T12:00:00Z`, { year: undefined })}</h2></div>
                <span className="match-count mono">{visible.length} trận</span>
              </div>
              <div className="results-toolbar">
                <div className="status-filters" role="group" aria-label="Lọc trạng thái">
                  {([
                    ["all", "Tất cả"], ["live", "Trực tiếp"], ["scheduled", "Sắp diễn ra"], ["finished", "Kết thúc"],
                  ] as const).map(([key, label]) => (
                    <button key={key} className={status === key ? "status-tab chosen" : "status-tab"} onClick={() => setStatus(key)}>
                      {key === "live" && <span className="live-dot" />}{label}
                    </button>
                  ))}
                </div>
                <label className="search-control"><Search size={17} />
                  <input type="search" placeholder="Tìm đội bóng, giải đấu..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Tìm trận đấu" />
                </label>
              </div>
              {favoritesOnly && <div className="filter-notice"><Heart size={15} /> Chỉ hiển thị trận yêu thích <button onClick={() => setFavoritesOnly(false)}>Bỏ lọc <X size={14} /></button></div>}
              {error && <div className="error-notice"><Info size={17} />Không thể cập nhật dữ liệu ({error}). Đang giữ kết quả cuối cùng.</div>}
              {feed.partial && <div className="source-notice"><Info size={17} />Một số nguồn đang gián đoạn. Các trận chưa cập nhật có thể hiển thị tỷ số từ lần tải trước.</div>}
              {loading && <><div className="loading-line"><span /></div><BallLoading /></>}
              <div className="results-list">
                {leagueGroups.length ? leagueGroups.map(([leagueId, matches]) => {
                  const meta = LEAGUES.find((item) => item.id === leagueId);
                  return (
                    <div className="league-section" key={leagueId}>
                      <div className="league-row-head">
                        <span className="league-icon">{meta?.short.slice(0, 2) ?? "FC"}</span>
                        <div><h3>{meta?.name ?? matches[0].leagueName}</h3><small>{meta?.country ?? matches[0].leagueCountry}</small></div>
                        <span className="league-rows-count">{matches.length} trận</span>
                        <ChevronRight size={16} className="league-head-chevron" />
                      </div>
                      {matches.map((match) => (
                        <MatchRow key={match.id} match={match} onOpen={() => setFocusedMatch(match)}
                          saved={favorites.includes(match.id)} onSave={() => toggleFavorite(match.id)} />
                      ))}
                    </div>
                  );
                }) : (
                  <div className="empty-results">
                    {loading ? <RefreshCw size={26} className="spinning" /> : <CalendarDays size={28} />}
                    <strong>{loading ? "Đang tải trận đấu..." : feed.partial && !games.length ? "Chưa thể lấy lịch thi đấu" : "Không tìm thấy trận đấu"}</strong>
                    <p>{loading ? "Đang đồng bộ dữ liệu từ các giải." : "Hãy chọn ngày khác hoặc thay đổi bộ lọc để xem thêm trận."}</p>
                    {!loading && <button onClick={resetFilters}>Xóa bộ lọc <ArrowUpRight size={16} /></button>}
                  </div>
                )}
              </div>
            </section>

            <aside className="right-column">
              <div className="sidebar-card" id="competitions">
                <div className="aside-heading"><div><span className="eyebrow">Bộ lọc</span><h3>Giải đấu</h3></div><Trophy size={18} /></div>
                <button className={`competition-item ${league === "all" ? "active" : ""}`} onClick={() => setLeague("all")}>
                  <span className="competition-mark">◉</span><span>Toàn bộ giải đấu</span><strong className="mono">{games.length}</strong>
                </button>
                {LEAGUES.map((item) => (
                  <button key={item.id} className={`competition-item ${league === item.id ? "active" : ""}`} onClick={() => setLeague(item.id)}>
                    <span className="competition-mark">{item.short.slice(0, 2)}</span><span>{item.name}</span>
                    <strong className="mono">{games.filter((m) => m.leagueId === item.id).length}</strong>
                  </button>
                ))}
              </div>
              <div className="sidebar-card coverage-card">
                <div className="aside-heading"><div><span className="eyebrow">Cập nhật tự động</span><h3>Theo từng phút</h3></div><Radio size={18} /></div>
                <div className="coverage-illustration">
                  <div className="pitch-outline"><span className="pitch-halfline" /><span className="pitch-circle" /><span className="pitch-goal pitch-goal-left" /><span className="pitch-goal pitch-goal-right" /></div>
                  <span className="pitch-live">90 giây / lần</span>
                </div>
                <p>Tỷ số và trạng thái trận đấu tự làm mới mỗi 90 giây khi bạn đang mở trang.</p>
                <div className="coverage-footer"><Check size={15} /> Không cần đăng ký tài khoản</div>
              </div>
              <div className="sidebar-card sources-card" id="about-data">
                <div className="aside-heading"><div><span className="eyebrow">Thông tin minh bạch</span><h3>Dữ liệu & bản quyền</h3></div><Info size={18} /></div>
                <p>Lịch thi đấu và tỷ số lấy từ ESPN (API công khai, không chính thức); OpenLigaDB dùng dự phòng cho Bundesliga.</p>
                <p>Logo do các nhà cung cấp dữ liệu lưu trữ và thuộc về chủ sở hữu tương ứng.</p>
                <a href="https://www.espn.com/soccer/" target="_blank" rel="noopener noreferrer">Nguồn dữ liệu <ArrowUpRight size={15} /></a>
              </div>
            </aside>
          </div>

          <footer className="site-footer"><span><b>SPORTS247</b> / FOOTBALL MATCH CENTER</span><span>Giờ hiển thị: Việt Nam (GMT+7) · <span className="footer-live" /> Dữ liệu được cập nhật định kỳ</span><span>© 2026 SPORTS247</span></footer>
        </main>
      </div>
      <MatchdayMascot event={goalEvent} />
      {focusedMatch && <MatchDialog match={focusedMatch} onClose={closeDialog} />}
    </div>
  );
}
