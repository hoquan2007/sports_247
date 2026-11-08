"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useGSAP } from "@gsap/react";
import { Button as AnimatedButton } from "@animate-ui/react/primitives/buttons/button";
import { Fade } from "@animate-ui/react/primitives/effects/fade";
import { Highlight, HighlightItem } from "@animate-ui/react/primitives/effects/highlight";
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import gsap from "gsap";
import {
  ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, ExternalLink, Heart, Info, MapPin, Radio, RefreshCw,
  Search, Share2, Star, Trophy, X,
} from "lucide-react";
import { BallLoading, MatchdayIntro, MatchdayMascot } from "@/components/matchday-motion";
import { LeagueBadge } from "@/components/league-badge";
import { TeamBadge, dateOf, labelForStatus, timeOf } from "@/components/match-center-ui";
import { detectGoalEvent, type GoalEvent } from "@/lib/football/goal-event";
import { FAVORITES_STORAGE_KEY, parseFavoriteIds, readFavoriteIds, writeFavoriteIds } from "@/lib/football/favorites";
import { reconcileFeed } from "@/lib/football/feed-state";
import { parseMatchFilters, serializeMatchFilters, type MatchFilters, type StatusFilter } from "@/lib/football/shareable-filters";
import { LEAGUES, shiftDate, vietnamDate } from "@/lib/football/leagues";
import { VIETNAM_LEAGUES } from "@/lib/football/vietnam-leagues";
import type { FootballMatch, MatchFeed } from "@/lib/football/types";

gsap.registerPlugin(useGSAP);
const DISPLAY_LEAGUES = [...LEAGUES, ...VIETNAM_LEAGUES];
const LeagueStandings = dynamic(() => import("@/components/league-standings").then((module) => module.LeagueStandings));
const MatchDialog = dynamic(() => import("@/components/match-dialog").then((module) => module.MatchDialog), { ssr: false });
const COMPETITION_ORDER = new Map(DISPLAY_LEAGUES.map((league, index) => [league.id, index]));
const EXTRA_STATUS_FILTERS = [
  { id: "postponed", label: "Tạm hoãn" },
  { id: "cancelled", label: "Đã hủy" },
  { id: "interrupted", label: "Gián đoạn" },
] as const;

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC", weekday: "short" });

function dayLabel(date: string) {
  return WEEKDAY_FORMATTER.format(new Date(`${date}T12:00:00Z`));
}
function DeferredStandings({ leagueId }: { leagueId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible || !containerRef.current) return;
    if (typeof IntersectionObserver === "undefined") {
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "400px 0px" });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [visible]);

  return <div ref={containerRef}>
    {visible ? <LeagueStandings leagueId={leagueId} /> :
      <section className="sidebar-card standings-card" aria-labelledby="standings-heading">
        <div className="aside-heading"><div><span className="eyebrow">Thứ hạng các đội</span><h3 id="standings-heading">Bảng xếp hạng</h3></div><Trophy size={18} /></div>
        <div className="standings-empty" role="status">Bảng xếp hạng sẽ tải khi bạn cuộn tới đây.</div>
      </section>}
  </div>;
}

function MatchRow({ match, saved, onSave, onOpen }: {
  match: FootballMatch; saved: boolean; onSave: () => void; onOpen: () => void;
}) {
  return (
    <div className={`match-row ${match.status === "live" ? "is-live" : ""}`}>
      <button className="match-open" onClick={onOpen}>
        <span className="sr-only">Xem chi tiết trận đấu:</span>
        <div className="match-clock">
          {match.status === "live" ? <span className="match-minute">{match.statusDetail}</span> : (
            <span className="mono">{match.status === "finished" ? "FT" : match.status === "scheduled"
              ? timeOf(match.startTime) : match.statusDetail}</span>
          )}
          <small>{match.status === "live" ? "LIVE" : match.status === "scheduled" ? "GMT+7" : labelForStatus(match.status)}</small>
        </div>
        <div className="match-teams">
          <div className="match-team"><TeamBadge team={match.home} size={27} /><span>{match.home.name}</span></div>
          <div className="match-team"><TeamBadge team={match.away} size={27} /><span>{match.away.name}</span></div>
        </div>
        <div className={`match-scores ${match.status === "live" ? "scores-live" : ""}`}>
          <span>{typeof match.homeScore !== "number" ? "–" : match.status === "live" ? <SlidingNumber number={match.homeScore} initiallyStable /> : match.homeScore}</span>
          <span>{typeof match.awayScore !== "number" ? "–" : match.status === "live" ? <SlidingNumber number={match.awayScore} initiallyStable /> : match.awayScore}</span>
        </div>
        <div className="match-broadcast" title={match.broadcasters[0] ? `Kênh theo nguồn: ${match.broadcasters[0]}` : "Nguồn chưa cung cấp kênh phát sóng"}>
          {match.broadcasters[0] ? `Kênh: ${match.broadcasters[0]}` : "Kênh chưa công bố"}
        </div>
        <ChevronRight className="row-chevron" size={16} />
      </button>
      <AnimatedButton type="button" tapScale={0.86} hoverScale={1.07} className={`save-button ${saved ? "saved" : ""}`}
        onClick={onSave} aria-label={saved ? "Bỏ lưu trận đấu" : "Lưu trận đấu"}
        title={saved ? "Bỏ yêu thích" : "Thêm yêu thích"}>
        <Star size={18} fill={saved ? "currentColor" : "none"} />
      </AnimatedButton>
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
    // Keep the crests visible immediately, since they are the mobile LCP elements.
    gsap.fromTo(".spotlight-center, .spotlight-club > strong, .spotlight-club > span", { autoAlpha: 0, y: 12, scale: .985 },
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
        <span className="spotlight-competition"><LeagueBadge leagueId={active.leagueId} size={23} /> {active.leagueName}</span>
      </div>
      <div className="spotlight-body" aria-live="off">
        <div className="spotlight-club">
          <div className="spotlight-crest"><TeamBadge team={active.home} size={104} eager /></div>
          <strong>{active.home.name}</strong><span>Chủ nhà</span>
        </div>
        <div className="spotlight-center">
          <span className={`spotlight-status ${active.status === "live" ? "is-live" : ""}`}>{active.status === "live" ? active.statusDetail : active.status === "scheduled" ? "Giờ bóng lăn" : labelForStatus(active.status)}</span>
          <strong className="spotlight-score mono" key={`${active.id}-${active.homeScore}-${active.awayScore}`}>
            {active.status === "scheduled" ? timeOf(active.startTime)
              : ["postponed", "cancelled", "interrupted", "awarded"].includes(active.status) ? active.statusDetail
                : `${active.homeScore ?? "–"} : ${active.awayScore ?? "–"}`}
          </strong>
          <span className="spotlight-date">{dateOf(active.startTime, { year: undefined })} · GMT+7</span>
          <button className="spotlight-open" onClick={() => onOpen(active)}>Chi tiết trận đấu <ArrowUpRight size={16} /></button>
        </div>
        <div className="spotlight-club">
          <div className="spotlight-crest"><TeamBadge team={active.away} size={104} eager /></div>
          <strong>{active.away.name}</strong><span>Đội khách</span>
        </div>
      </div>
      <div className="spotlight-bottom">
        <span className="spotlight-location"><MapPin size={14} /> {active.venue ?? "Địa điểm chưa công bố"}</span>
        <div className="spotlight-controls" role="group" aria-label="Chuyển trận nổi bật">
          <button aria-label="Trận trước" onClick={() => move(-1)}><ChevronLeft size={19} /></button>
          <span className="spotlight-count mono">{String((index % prioritized.length) + 1).padStart(2, "0")} / {String(prioritized.length).padStart(2, "0")}</span>
          <button aria-label="Trận tiếp theo" onClick={() => move(1)}><ChevronRight size={19} /></button>
        </div>
      </div>
      {!reduceMotion && !paused && prioritized.length > 1 && <div className="spotlight-progress" key={index} aria-hidden="true" />}
    </section>
  );
}

export function MatchCenter({ initialFeed, initialFilters }: { initialFeed: MatchFeed; initialFilters?: MatchFilters }) {
  const filters: MatchFilters = initialFilters ?? { date: initialFeed.date, league: "all", status: "all", query: "" };
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState(filters.date);
  const [feed, setFeed] = useState(initialFeed);
  const [league, setLeague] = useState(filters.league);
  const [status, setStatus] = useState<StatusFilter>(filters.status);
  const [query, setQuery] = useState(filters.query);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "unavailable">("idle");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [focusedMatch, setFocusedMatch] = useState<FootballMatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstLoad = useRef(true);
  const [clockNow, setClockNow] = useState<Date | null>(null);
  const [goalEvent, setGoalEvent] = useState<GoalEvent | null>(null);
  const previousSnapshot = useRef({ date: initialFeed.date, matches: initialFeed.matches, complete: !initialFeed.partial });
  const latestFeedRef = useRef<MatchFeed>(initialFeed);
  const activeDateRef = useRef(initialFeed.date);
  const latestRequestRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);
  const cancelActiveRequest = useCallback(() => {
    const controller = activeRequestRef.current;
    activeRequestRef.current = null;
    latestRequestRef.current++;
    controller?.abort();
  }, []);

  useEffect(() => {
    // Keep shared links accurate after filter changes without creating a history entry on every keystroke.
    const params = serializeMatchFilters({ date: selectedDate, league, status, query });
    const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== url) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [selectedDate, league, status, query]);

  useEffect(() => {
    const restoreFilters = () => {
      const restored = parseMatchFilters(new URLSearchParams(window.location.search), vietnamDate(new Date()));
      activeDateRef.current = restored.date;
      setSelectedDate(restored.date);
      setLeague(restored.league);
      setStatus(restored.status);
      setQuery(restored.query);
      setFavoritesOnly(false);
      setShareStatus("idle");
    };
    window.addEventListener("popstate", restoreFilters);
    return () => window.removeEventListener("popstate", restoreFilters);
  }, []);

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
    try { setFavorites(readFavoriteIds(window.localStorage)); }
    catch { setFavorites([]); /* Storage access can be blocked by the browser. */ }
    setFavoritesReady(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === FAVORITES_STORAGE_KEY || event.key === null) {
        setFavorites(parseFavoriteIds(event.newValue));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    // Persist after hydration and render, never from a React state updater.
    if (!favoritesReady) return;
    try { writeFavoriteIds(window.localStorage, favorites); }
    catch { /* The favorites remain available for this tab's session. */ }
  }, [favorites, favoritesReady]);
  useEffect(() => {
    const tick = () => setClockNow(new Date());
    tick();
    const timer = window.setInterval(tick, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const retrieve = useCallback(async (date: string, silent: boolean) => {
    // Polls never compete with an in-flight request; explicit refreshes replace it.
    if (silent && activeRequestRef.current) return;
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    const requestId = ++latestRequestRef.current;
    setRefreshing(true);
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/matches?date=${encodeURIComponent(date)}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as MatchFeed;
      if (!controller.signal.aborted && requestId === latestRequestRef.current && date === activeDateRef.current && data.date === date) {
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
      if (!controller.signal.aborted && requestId === latestRequestRef.current && date === activeDateRef.current)
        setError(cause instanceof Error ? cause.message : "Không thể cập nhật dữ liệu");
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (firstLoad.current) firstLoad.current = false;
    else void retrieve(selectedDate, false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void retrieve(selectedDate, true);
    }, 90000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void retrieve(selectedDate, true);
    };
    const onOnline = () => {
      if (document.visibilityState === "visible") void retrieve(selectedDate, true);
    };
    const onOffline = () => {
      cancelActiveRequest();
      setLoading(false);
      setRefreshing(false);
      setError("Mất kết nối mạng");
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      cancelActiveRequest();
    };
  }, [selectedDate, retrieve, cancelActiveRequest]);

  const toggleFavorite = (id: string) => {
    setFavorites((old) => old.includes(id) ? old.filter((item) => item !== id) : [...old, id]);
  };
  const today = vietnamDate(clockNow ?? new Date());
  const games = useMemo(() => feed.date === selectedDate ? feed.matches : [], [feed, selectedDate]);
  const tickerGames = useMemo(() => featuredMatches(games, 8), [games]);
  const totals = useMemo(() => ({
    total: games.length,
    live: games.filter((m) => m.status === "live").length,
    finished: games.filter((m) => m.status === "finished").length,
    awarded: games.filter((m) => m.status === "awarded").length,
    upcoming: games.filter((m) => m.status === "scheduled").length,
  }), [games]);
  const feedDegraded = feed.date === selectedDate && feed.partial;
  const pendingSelectedLeague = feed.date === selectedDate && league !== "all" &&
    (feed.pendingLeagues ?? []).includes(league);
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
    if (day === selectedDate) {
      setStatus("all"); setError(null); setGoalEvent(null);
      void retrieve(day, false);
      return;
    }
    activeDateRef.current = day;
    latestRequestRef.current++;
    setSelectedDate(day); setStatus("all"); setError(null); setGoalEvent(null);
  };
  const goToday = () => { setFavoritesOnly(false); setLeague("all"); setQuery(""); chooseDate(today); };
  const resetFilters = () => { setFavoritesOnly(false); setLeague("all"); setStatus("all"); setQuery(""); };
  const shareFilters = async () => {
    const url = new URL(window.location.href);
    url.search = serializeMatchFilters({ date: selectedDate, league, status, query }).toString();
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url.toString());
      setShareStatus("copied");
    } catch {
      setShareStatus("unavailable");
    }
  };
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
            <button className={favoritesOnly ? "favorites-link active" : "favorites-link"} onClick={() => setFavoritesOnly((current) => !current)} aria-label="Chỉ hiển thị trận đã lưu" aria-pressed={favoritesOnly}><Heart size={17} fill={favoritesOnly ? "currentColor" : "none"} /> <span>Đã lưu</span></button>
            <span className="clock-label"><Clock3 size={14} /> {clockNow ? timeOf(clockNow.toISOString()) : "--:--"} <span>GMT+7</span></span>
            <span className="header-separator" />
            <button className="header-refresh" onClick={() => void retrieve(selectedDate, false)} aria-label="Làm mới tỷ số" title="Làm mới dữ liệu" aria-busy={refreshing}><RefreshCw size={17} className={refreshing ? "spinning" : ""} /></button>
          </div>
        </header>

        <div className="score-ticker" role="group" aria-label="Tỷ số nhanh">
          <div className="ticker-label"><Radio size={15} /><strong>MATCH<br />CENTER</strong></div>
          <div className="ticker-events">
            {games.length ? <div className="ticker-track">
              {[0, 1].map((repeat) => <div className="ticker-set" key={repeat} aria-hidden={repeat === 1}>
                {tickerGames.map((m) => <button key={`${repeat}-${m.id}`} className="ticker-event" tabIndex={repeat === 1 ? -1 : 0} onClick={() => setFocusedMatch(m)}>
                  <small className="ticker-competition"><LeagueBadge leagueId={m.leagueId} size={20} /> {m.leagueName}</small>
                  <div><TeamBadge team={m.home} size={21} /><span>{m.home.shortName}</span><strong className="mono">{m.status === "scheduled" ? timeOf(m.startTime) : ["postponed", "cancelled", "interrupted", "awarded"].includes(m.status) ? m.statusDetail : `${m.homeScore ?? "–"} : ${m.awayScore ?? "–"}`}</strong><span>{m.away.shortName}</span><TeamBadge team={m.away} size={21} /></div>
                </button>)}
              </div>)}
            </div> : <span className="ticker-empty">Chọn ngày để xem các trận đấu.</span>}
          </div>
        </div>

        <main className="workspace">
          <div className="section-heading">
            <div className="matchday-heading-copy">
              <div><span className="matchday-heading-kicker">Cùng nhịp bóng đá</span><h1>Match<span>day.</span></h1></div>
              <div className={`update-indicator${error || feedDegraded ? " update-indicator--error" : ""}`} role="status" aria-live="polite">
                <span className={`status-orb ${totals.live > 0 && !error && !feedDegraded ? "pulsing" : ""}`} />
                <span>{error ? "Cập nhật gián đoạn" : feedDegraded ? "Một số giải chưa cập nhật" : "Tỷ số & lịch thi đấu"}</span>
                <span className="update-stamp">{error ? (feed.date === selectedDate ? `Dữ liệu gần nhất lúc ${timeOf(feed.updatedAt)}` : "Chưa có dữ liệu ngày này") : feed.date === selectedDate ? `Cập nhật lúc ${timeOf(feed.updatedAt)}` : "Đang tải lịch ngày đã chọn"}</span>
                {(error || feedDegraded) && <button className="update-retry" type="button" onClick={() => void retrieve(selectedDate, false)}>Thử lại</button>}
              </div>
            </div>
            <MatchdayMascot event={goalEvent} />
          </div>

          <MatchSpotlight key={selectedDate} matches={games} onOpen={setFocusedMatch} />

          <div className="date-panel">
            <div className="date-panel-title"><CalendarDays size={17} /><span>Chọn ngày thi đấu</span></div>
            <AnimatedButton type="button" tapScale={0.9} className="date-arrow" aria-label="Ngày trước" onClick={() => chooseDate(shiftDate(selectedDate, -1))}><ChevronLeft size={20} /></AnimatedButton>
            <div className="date-tabs">
              {dateTabs.map((day) => (
                <AnimatedButton key={day} type="button" tapScale={0.96} className={`date-tab ${day === selectedDate ? "selected" : ""}`} aria-pressed={day === selectedDate} onClick={() => chooseDate(day)}>
                  <span>{day === today ? "Hôm nay" : dayLabel(day)}</span>
                  <strong className="mono">{day.slice(8, 10)}/{day.slice(5, 7)}</strong>
                </AnimatedButton>
              ))}
            </div>
            <AnimatedButton type="button" tapScale={0.9} className="date-arrow" aria-label="Ngày tiếp theo" onClick={() => chooseDate(shiftDate(selectedDate, 1))}><ChevronRight size={20} /></AnimatedButton>
            <AnimatedButton type="button" tapScale={0.96} className="today-link" onClick={goToday}>Về hôm nay <ArrowUpRight size={14} /></AnimatedButton>
          </div>

          <div className="stats-strip" role="group" aria-label="Thống kê và lọc trận đấu">
            {([
              { id: "all", label: "Tất cả trận", count: totals.total, detail: "trong ngày" },
              { id: "live", label: "Trực tiếp", count: totals.live, detail: "đang diễn ra" },
              { id: "scheduled", label: "Sắp diễn ra", count: totals.upcoming, detail: "chưa bắt đầu" },
              { id: "finished", label: "Kết quả", count: totals.finished, detail: "đã kết thúc" },
            ] as const).map(({ id, label, count, detail }) => (
              <button
                key={id}
                type="button"
                className={`stat-box stat-box--${id}${status === id ? " is-selected" : ""}`}
                aria-pressed={status === id}
                onClick={() => setStatus(id)}
              >
                <span className="stat-box-label"><span className={`stat-box-pip${id === "live" && count > 0 ? " is-live" : ""}`} aria-hidden="true" />{label}</span>
                <span className="stat-box-reading"><strong className="stat-box-number mono">{count < 10 && "0"}<SlidingNumber number={count} initiallyStable /></strong><small>{detail}</small></span>
              </button>
            ))}
          </div>

          <div className="content-grid">
            <section className="results-area" aria-label="Danh sách trận đấu">
              <div className="results-heading">
                <div><span className="eyebrow">Toàn bộ trận đấu</span><h2>{selectedDate === today ? "Hôm nay" : dateOf(`${selectedDate}T12:00:00Z`, { year: undefined })}</h2></div>
                <div className="results-heading-actions">
                  <span className="match-count mono">{visible.length} trận</span>
                  <button type="button" className="share-filters" onClick={() => void shareFilters()} aria-label="Sao chép liên kết bộ lọc hiện tại" title="Sao chép liên kết chia sẻ"><Share2 size={15} /><span>Chia sẻ</span></button>
                </div>
              </div>
              {shareStatus !== "idle" && <p className="share-feedback" role="status" aria-live="polite">{shareStatus === "copied" ? "Đã sao chép liên kết bộ lọc." : "Không thể sao chép tự động. Bạn có thể sao chép liên kết trên thanh địa chỉ."}</p>}
              <div className="results-toolbar">
                <div className="status-filters" role="group" aria-label="Lọc trạng thái">
                  <Highlight mode="parent" controlledItems value={status} click={false} containerClassName="status-filter-track" className="status-filter-thumb">
                    {([
                      ["all", "Tất cả"], ["live", "Trực tiếp"], ["scheduled", "Sắp diễn ra"], ["finished", "Kết thúc"],
                    ] as const).map(([key, label]) => (
                      <HighlightItem key={key} value={key} asChild>
                        <button type="button" className={status === key ? "status-tab chosen" : "status-tab"} aria-pressed={status === key} onClick={() => setStatus(key)}>
                          {key === "live" && <span className="live-dot" />}{label}
                        </button>
                      </HighlightItem>
                    ))}
                    {(totals.awarded > 0 || status === "awarded") && <HighlightItem value="awarded" asChild>
                      <button type="button" className={status === "awarded" ? "status-tab chosen" : "status-tab"} aria-pressed={status === "awarded"} onClick={() => setStatus("awarded")}>Xử lý hành chính ({totals.awarded})</button>
                    </HighlightItem>}
                    {EXTRA_STATUS_FILTERS.map(({ id, label }) => {
                      const count = games.filter((match) => match.status === id).length;
                      return count > 0 || status === id ? <HighlightItem key={id} value={id} asChild>
                        <button type="button" className={status === id ? "status-tab chosen" : "status-tab"} aria-pressed={status === id} onClick={() => setStatus(id)}>{label} ({count})</button>
                      </HighlightItem> : null;
                    })}
                  </Highlight>
                </div>
                <label className="search-control"><Search size={17} />
                  <input type="search" placeholder="Tìm đội bóng, giải đấu..." value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} aria-label="Tìm trận đấu" />
                </label>
              </div>
              {favoritesOnly && <div className="filter-notice"><Heart size={15} /> Chỉ hiển thị trận yêu thích <button onClick={() => setFavoritesOnly(false)}>Bỏ lọc <X size={14} /></button></div>}
              {loading && <><div className="loading-line"><span /></div><BallLoading /></>}
              <div className="results-list">
                {leagueGroups.length ? leagueGroups.map(([leagueId, matches]) => {
                  const meta = DISPLAY_LEAGUES.find((item) => item.id === leagueId);
                  return (
                    <Fade asChild inView initialOpacity={0.92} key={leagueId}>
                      <div className="league-section" style={{ containIntrinsicSize: `auto ${70 + matches.length * 100}px` }}>
                        <div className="league-row-head">
                          <LeagueBadge leagueId={leagueId} size={39} className="league-icon" />
                          <div><h3>{meta?.name ?? matches[0].leagueName}</h3><small>{meta?.country ?? matches[0].leagueCountry}</small></div>
                          <span className="league-rows-count">{matches.length} trận</span>
                          <ChevronRight size={16} className="league-head-chevron" />
                        </div>
                        {matches.map((match) => (
                          <MatchRow key={match.id} match={match} onOpen={() => setFocusedMatch(match)}
                            saved={favorites.includes(match.id)} onSave={() => toggleFavorite(match.id)} />
                        ))}
                      </div>
                    </Fade>
                  );
                }) : (
                  <div className="empty-results">
                    {loading ? <RefreshCw size={26} className="spinning" /> : <CalendarDays size={28} />}
                    <strong>{loading ? "Đang tải trận đấu..." : pendingSelectedLeague ? "Lịch giải này chưa có dữ liệu xác nhận" : !games.length && (error || (feed.partial && (league === "all" || feed.failedLeagues?.includes(league)))) ? "Chưa thể lấy lịch thi đấu" : "Không tìm thấy trận đấu"}</strong>
                    <p>{loading ? "Đang đồng bộ dữ liệu từ các giải." : pendingSelectedLeague ? "SPORTS247 hiện chưa nhận được lịch đáng tin cậy cho giải này. Vui lòng đối chiếu với ban tổ chức." : "Hãy chọn ngày khác hoặc thay đổi bộ lọc để xem thêm trận."}</p>
                    {!loading && (pendingSelectedLeague ?
                      <a className="empty-source-link" href="https://vpf.vn/mobile/" target="_blank" rel="noopener noreferrer">Xem lịch trên VPF <ExternalLink size={16} /></a> :
                      <button onClick={resetFilters}>Xóa bộ lọc <ArrowUpRight size={16} /></button>)}
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
                {DISPLAY_LEAGUES.map((item) => (
                  <button key={item.id} className={`competition-item ${league === item.id ? "active" : ""}`} onClick={() => setLeague(item.id)}>
                    <LeagueBadge leagueId={item.id} size={31} className="competition-mark" /><span>{item.name}</span>
                    <strong className="mono">{games.filter((m) => m.leagueId === item.id).length}</strong>
                  </button>
                ))}
                <a className="watch-guide" href="https://vpf.vn/mobile/" target="_blank" rel="noopener noreferrer">
                  Lịch V.League 1 &amp; V.League 2 trên VPF <ExternalLink size={14} />
                </a>
              </div>
              <DeferredStandings leagueId={league} />
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
                <p>Lịch và tỷ số lấy từ ESPN (API công khai, không chính thức), OpenLigaDB dự phòng Bundesliga và API-Football cho V.League khi đã cấu hình. Nguồn Việt Nam có thể cập nhật chậm hơn do giới hạn quota.</p>
                <p>Logo 18 giải lấy từ metadata ESPN; ảnh nhận diện V.League 1 và 2 mùa 2026/27 tham chiếu nguồn VPF, tự chuyển sang chữ khi máy chủ ảnh không truy cập được. Quyền ảnh và nhãn hiệu thuộc chủ sở hữu tương ứng.</p>
                <p>Video chỉ xuất hiện nếu nhà cung cấp có quyền nhúng, đã được cấu hình và có trận phù hợp.</p>
                <a href="https://www.espn.com/soccer/" target="_blank" rel="noopener noreferrer">Nguồn dữ liệu <ArrowUpRight size={15} /></a>
              </div>
            </aside>
          </div>

          <footer className="site-footer"><span><b>SPORTS247</b> / FOOTBALL MATCH CENTER</span><span>Giờ hiển thị: Việt Nam (GMT+7) · <span className="footer-live" /> Dữ liệu được cập nhật định kỳ</span><span>© 2026 SPORTS247</span></footer>
        </main>
      </div>
      {focusedMatch && <MatchDialog key={focusedMatch.id} match={games.find((item) => item.id === focusedMatch.id) ?? focusedMatch} onClose={closeDialog} />}
    </div>
  );
}
