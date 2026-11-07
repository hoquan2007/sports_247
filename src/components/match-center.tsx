"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { Button as AnimatedButton } from "@animate-ui/react/primitives/buttons/button";
import { Fade } from "@animate-ui/react/primitives/effects/fade";
import { Highlight, HighlightItem } from "@animate-ui/react/primitives/effects/highlight";
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import gsap from "gsap";
import {
  Activity, ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, ExternalLink, Heart, Info, MapPin, Radio, RefreshCw,
  Search, Share2, Star, Trophy, Tv, X,
} from "lucide-react";
import { BallLoading, MatchdayIntro, MatchdayMascot } from "@/components/matchday-motion";
import { LeagueBadge } from "@/components/league-badge";
import { LeagueStandings } from "@/components/league-standings";
import { detectGoalEvent, type GoalEvent } from "@/lib/football/goal-event";
import { FAVORITES_STORAGE_KEY, parseFavoriteIds, readFavoriteIds, writeFavoriteIds } from "@/lib/football/favorites";
import { reconcileFeed } from "@/lib/football/feed-state";
import { parseMatchFilters, serializeMatchFilters, type MatchFilters, type StatusFilter } from "@/lib/football/shareable-filters";
import type { DetailEvent, DetailLineup, DetailStatistic, MatchDetails } from "@/lib/football/match-details";
import { LEAGUES, shiftDate, vietnamDate, VIETNAM_TIMEZONE } from "@/lib/football/leagues";
import { isVietnamLeague, VIETNAM_LEAGUES } from "@/lib/football/vietnam-leagues";
import { teamLogoImageUrl } from "@/lib/football/team-logo";
import type { FootballMatch, FootballTeam, MatchFeed, MatchStatus } from "@/lib/football/types";
import type { WatchResult } from "@/lib/football/watch";

gsap.registerPlugin(useGSAP);
const DISPLAY_LEAGUES = [...LEAGUES, ...VIETNAM_LEAGUES];
const COMPETITION_ORDER = new Map(DISPLAY_LEAGUES.map((league, index) => [league.id, index]));
const EXTRA_STATUS_FILTERS = [
  { id: "postponed", label: "Tạm hoãn" },
  { id: "cancelled", label: "Đã hủy" },
  { id: "interrupted", label: "Gián đoạn" },
] as const;

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
  return status === "live" ? "Đang diễn ra" : status === "finished" ? "Kết thúc"
    : status === "postponed" ? "Hoãn" : status === "cancelled" ? "Đã hủy"
    : status === "interrupted" ? "Gián đoạn" : status === "awarded" ? "Kết quả hành chính" : "Chưa bắt đầu";
}

function TeamBadge({ team, size = 32, eager = false }: { team: FootballTeam; size?: number; eager?: boolean }) {
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

function LiveMark({ compact = false }: { compact?: boolean }) {
  return <span className="live-mark"><i className="live-dot" />{compact ? "LIVE" : "Đang trực tiếp"}</span>;
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

type DetailTab = "overview" | "stats" | "lineups" | "timeline" | "watch";
const DETAIL_TABS: { id: DetailTab; title: string }[] = [
  { id: "overview", title: "Tổng quan" },
  { id: "stats", title: "Thống kê" },
  { id: "lineups", title: "Đội hình" },
  { id: "timeline", title: "Diễn biến" },
  { id: "watch", title: "Xem trực tiếp" },
];

function EmptyDetail({ children }: { children: React.ReactNode }) {
  return <div className="detail-empty"><Info size={22} aria-hidden="true" /><p>{children}</p></div>;
}

function StatsList({ statistics, limit }: { statistics: DetailStatistic[]; limit?: number }) {
  const visible = limit ? statistics.slice(0, limit) : statistics;
  return (
    <div className="detail-stats-list">
      {visible.map((stat) => {
        const total = Math.max(0, stat.homeValue ?? 0) + Math.max(0, stat.awayValue ?? 0);
        const homeShare = total > 0 ? Math.max(0, Math.min(100, ((stat.homeValue ?? 0) / total) * 100)) : 50;
        return (
          <div className="detail-stat" key={stat.key}>
            <div className="detail-stat-values"><strong>{stat.home}</strong><span>{stat.label}</span><strong>{stat.away}</strong></div>
            <div className="detail-stat-bars" aria-hidden="true">
              <span className="detail-stat-home" style={{ width: `${homeShare}%` }} />
              <span className="detail-stat-away" style={{ width: `${100 - homeShare}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventList({ events, homeId }: { events: DetailEvent[]; homeId: string | null }) {
  return <ol className="detail-event-list">
    {events.map((event) => <li key={event.id} className={event.teamId === homeId ? "event-home" : ""}>
      <span className="detail-event-time mono">{event.minute}</span>
      <span className={`detail-event-mark detail-event-${event.kind}`} aria-hidden="true">
        {event.kind === "goal" ? "⚽" : event.kind === "card" ? "▮" : event.kind === "substitution" ? "↔" : "•"}
      </span>
      <div><strong>{event.title}</strong>{event.description && <p>{event.description}</p>}</div>
    </li>)}
  </ol>;
}

function LineupCard({ lineup, team }: { lineup: DetailLineup | undefined; team: FootballTeam }) {
  return <div className="detail-lineup-card">
    <div className="detail-lineup-heading"><TeamBadge team={team} size={30} /><strong>{team.name}</strong>
      {lineup?.formation && <span className="mono">{lineup.formation}</span>}
    </div>
    {!lineup || (!lineup.starters.length && !lineup.substitutes.length) ? (
      <p className="detail-muted">Đội hình chưa được ESPN công bố.</p>
    ) : <>
      {lineup.starters.length > 0 && <div className="detail-player-group">
        <h4>Đá chính</h4>
        {lineup.starters.map((player) => <div className="detail-player" key={player.id}>
          <span className="mono">{player.number ?? "–"}</span><strong>{player.name}</strong><small>{player.position}</small>
        </div>)}
      </div>}
      {lineup.substitutes.length > 0 && <div className="detail-player-group">
        <h4>Dự bị / Danh sách cầu thủ</h4>
        {lineup.substitutes.map((player) => <div className="detail-player" key={player.id}>
          <span className="mono">{player.number ?? "–"}</span><strong>{player.name}</strong><small>{player.position}</small>
        </div>)}
      </div>}
    </>}
  </div>;
}

const FORM_LABELS = { W: "Thắng", D: "Hòa", L: "Thua" } as const;
function RecentForm({ team }: { team: FootballTeam }) {
  return <div className="match-form-row">
    <span className="match-form-team">{team.name}</span>
    <span className="match-form-results" aria-label={team.form?.length
      ? `${team.name}: ${team.form.map((result) => FORM_LABELS[result]).join(", ")}`
      : `${team.name}: chưa có dữ liệu phong độ`}>
      {team.form?.length ? team.form.map((result, index) =>
        <span key={index} className={`match-form-chip match-form-${result.toLowerCase()}`} aria-hidden="true"
          title={FORM_LABELS[result]}>{result === "W" ? "T" : result === "D" ? "H" : "B"}</span>)
        : <span className="match-form-missing">Chưa có dữ liệu</span>}
    </span>
  </div>;
}

function MatchDialog({ match, onClose }: { match: FootballMatch; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const activeDetailRequest = useRef<AbortController | null>(null);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [details, setDetails] = useState<MatchDetails | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [retryNumber, setRetryNumber] = useState(0);
  const [watch, setWatch] = useState<WatchResult | null>(null);
  const [watchError, setWatchError] = useState(false);
  const [watchRetry, setWatchRetry] = useState(0);
  const supported = match.source === "ESPN";
  const watchSupported = supported || (match.source === "API-Football" && isVietnamLeague(match.leagueId));

  useEffect(() => {
    if (tab !== "watch" || !watchSupported) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const params = new URLSearchParams({ league: match.leagueId, event: match.eventId });
        const response = await fetch(`/api/watch?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json() as WatchResult;
        if (!controller.signal.aborted) { setWatch(result); setWatchError(false); }
      } catch {
        if (!controller.signal.aborted) setWatchError(true);
      }
    };
    void load();
    return () => controller.abort();
  }, [tab, watchSupported, match.leagueId, match.eventId, watchRetry]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.getClientRects().length > 0);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (!supported) return;
    let disposed = false;
    const load = async () => {
      // The latest live refresh wins even when a previous ESPN request is slow.
      activeDetailRequest.current?.abort();
      const controller = new AbortController();
      activeDetailRequest.current = controller;
      try {
        const params = new URLSearchParams({ league: match.leagueId, event: match.eventId });
        const response = await fetch(`/api/match-details?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json() as MatchDetails;
        if (!disposed && !controller.signal.aborted) { setDetails(result); setDetailError(false); }
      } catch {
        if (!disposed && !controller.signal.aborted) setDetailError(true);
      } finally {
        if (activeDetailRequest.current === controller) activeDetailRequest.current = null;
      }
    };
    void load();
    const timer = match.status === "live" ? window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000) : undefined;
    return () => {
      disposed = true;
      activeDetailRequest.current?.abort();
      activeDetailRequest.current = null;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [match.leagueId, match.eventId, match.status, retryNumber, supported]);

  const homeId = details?.homeId ?? match.home.id;
  const awayId = details?.awayId ?? match.away.id;
  const hasDetail = Boolean(details);
  const noDataMessage = match.status === "scheduled"
    ? "Trận đấu chưa diễn ra. ESPN thường cập nhật đội hình gần giờ bóng lăn, còn thống kê và diễn biến sẽ xuất hiện khi trận bắt đầu."
    : ["postponed", "cancelled", "interrupted", "awarded"].includes(match.status)
      ? `Trận đấu có trạng thái ${labelForStatus(match.status).toLowerCase()}. Hiện chưa có dữ liệu chi tiết bổ sung.`
      : "ESPN chưa cung cấp dữ liệu cho mục này ở trận đấu hiện tại.";
  const showEvents = details?.events ?? [];
  const renderDetail = () => {
    if (tab === "watch") {
      const officialGuide = isVietnamLeague(match.leagueId) ? "https://vpf.vn/mobile/"
        : match.leagueId === "uefa.champions"
        ? "https://www.uefa.com/uefachampionsleague/news/0253-0d82037aaedd-f371c464f919-1000--/"
        : match.leagueId === "uefa.europa"
          ? "https://www.uefa.com/uefaeuropaleague/news/028d-1ae6d62165d6-69b17b354deb-1000/"
          : null;
      return <section className="detail-content-card watch-card" aria-label="Nguồn phát trực tiếp hợp pháp">
        <div className="detail-section-heading"><h3><Tv size={17} /> Xem trận đấu</h3><small>Đối chiếu nguồn chính thức</small></div>
        {watch?.status === "ready" ? <>
          <div className="watch-frame"><iframe src={watch.embedUrl} title={`${watch.title} — ${match.home.name} vs ${match.away.name}`}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin" loading="lazy" /></div>
          <p className="watch-note">{watch.broadcastType === "live" ? `Trận đang diễn ra — nguồn phát từ ${watch.provider}.` :
            watch.broadcastType === "replay" ? "Trận đã kết thúc — đây có thể là video phát lại." :
              watch.broadcastType === "upcoming" ? "Trận chưa bắt đầu — video có thể là tín hiệu chờ." :
                "Trạng thái nguồn phát phụ thuộc nhà cung cấp và quyền nhúng theo trận."} Luồng có thể giới hạn theo khu vực hoặc yêu cầu quyền xem.</p>
          <a className="detail-subtle-link" href={watch.embedUrl} target="_blank" rel="noopener noreferrer">Mở nguồn phát chính thức <ExternalLink size={15} /></a>
        </> : <div className="detail-empty watch-state" role="status"><Tv size={22} />
          <p>{!watchSupported ? "Nguồn trận đấu này chưa hỗ trợ đối chiếu video." : watchError ? "Không thể kết nối dịch vụ video chính thức." : watch?.message ?? "Đang kiểm tra xem trận đấu có nguồn phát được phép nhúng..."}</p>
          {(watchError || watch?.status === "unavailable") && <button className="detail-retry" onClick={() => { setWatch(null); setWatchError(false); setWatchRetry((n) => n + 1); }}>
            Thử lại <RefreshCw size={14} /></button>}
        </div>}
        {officialGuide && <a className="watch-guide" href={officialGuide} target="_blank" rel="noopener noreferrer">
          {isVietnamLeague(match.leagueId) ? "Xem lịch, kênh phát và thông tin từ VPF" : "Xem danh sách đơn vị sở hữu quyền phát sóng tại Việt Nam trên UEFA"} <ExternalLink size={15} />
        </a>}
        <p className="watch-note">Thông tin kênh có thể áp dụng cho quốc gia khác. Chỉ phát video khi nhà cung cấp cho phép nhúng.</p>
      </section>;
    }
    if (!supported) return <EmptyDetail>Trận này dùng nguồn {match.source}, chưa hỗ trợ dữ liệu chi tiết ESPN. Bạn vẫn có thể xem lịch, tỷ số và thông tin trận phía trên.</EmptyDetail>;
    if (!hasDetail && !detailError) return <div className="detail-loading" role="status"><RefreshCw className="spinning" size={20} /> Đang tải dữ liệu trận đấu từ ESPN...</div>;
    if (!hasDetail && detailError) return <div className="detail-empty" role="status"><Info size={22} />
      <p>Chưa thể kết nối ESPN để tải chi tiết trận. Thông tin cơ bản vẫn được giữ nguyên.</p>
      <button className="detail-retry" onClick={() => { setDetailError(false); setRetryNumber((n) => n + 1); }}>Thử lại <RefreshCw size={15} /></button>
    </div>;

    if (tab === "stats") return details!.statistics.length > 0
      ? <section className="detail-content-card" aria-label="So sánh thống kê">
        <div className="detail-section-heading"><h3>So sánh hai đội</h3><small>Chủ nhà / Đội khách</small></div>
        <StatsList statistics={details!.statistics} />
      </section>
      : <EmptyDetail>{noDataMessage}</EmptyDetail>;

    if (tab === "lineups") return <div className="detail-lineups">
      <LineupCard lineup={details!.lineups.find((lineup) => lineup.teamId === homeId)} team={match.home} />
      <LineupCard lineup={details!.lineups.find((lineup) => lineup.teamId === awayId)} team={match.away} />
    </div>;

    if (tab === "timeline") return <>
      <section className="detail-content-card">
        <div className="detail-section-heading"><h3>Diễn biến chính</h3><small>{showEvents.length ? `${showEvents.length} sự kiện` : "Theo ESPN"}</small></div>
        {showEvents.length ? <EventList events={showEvents} homeId={homeId} /> : <EmptyDetail>{noDataMessage}</EmptyDetail>}
      </section>
      {details!.commentary.length > 0 && <section className="detail-content-card">
        <div className="detail-section-heading"><h3>Tường thuật</h3><small>ESPN</small></div>
        <ol className="detail-commentary">
          {details!.commentary.map((item) => <li key={item.id}><span className="mono">{item.minute}</span><p>{item.text}</p></li>)}
        </ol>
      </section>}
    </>;

    return <>
      {showEvents.length > 0 && <section className="detail-content-card">
        <div className="detail-section-heading"><h3>Điểm nhấn trận đấu</h3>
          <button className="detail-subtle-link" onClick={() => setTab("timeline")}>Xem tất cả <ChevronRight size={15} /></button>
        </div>
        <EventList events={showEvents.slice(0, 5)} homeId={homeId} />
      </section>}
      {details!.statistics.length > 0 && <section className="detail-content-card">
        <div className="detail-section-heading"><h3>Thống kê nổi bật</h3>
          <button className="detail-subtle-link" onClick={() => setTab("stats")}>Chi tiết <ChevronRight size={15} /></button>
        </div>
        <StatsList statistics={details!.statistics} limit={4} />
      </section>}
      {!showEvents.length && !details!.statistics.length && <EmptyDetail>{noDataMessage}</EmptyDetail>}
    </>;
  };

  const chooseTabOnKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const destination = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1
      : event.key === "Home" ? 0 : event.key === "End" ? DETAIL_TABS.length - 1 : null;
    if (destination === null) return;
    event.preventDefault();
    const nextIndex = (destination + DETAIL_TABS.length) % DETAIL_TABS.length;
    setTab(DETAIL_TABS[nextIndex].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="match-dialog" role="dialog" aria-modal="true" aria-label={`Chi tiết ${match.home.name} - ${match.away.name}`} ref={dialogRef}>
        <div className="dialog-topline">
          <span className="eyebrow dialog-league-label">TRUNG TÂM TRẬN ĐẤU <span className="dialog-separator">/</span> <LeagueBadge leagueId={match.leagueId} size={26} /> {match.leagueName}</span>
          <button onClick={onClose} className="icon-button" aria-label="Đóng" ref={closeRef}><X size={20} /></button>
        </div>
        <p className="dialog-datetime"><CalendarDays size={15} /> {dateOf(match.startTime)} · {timeOf(match.startTime)} (GMT+7)</p>
        <div className="dialog-scoreline">
          <div className="dialog-team"><TeamBadge team={match.home} size={76} /><strong>{match.home.name}</strong><small>Chủ nhà</small></div>
          <div className="dialog-score">
            {match.status === "live" && <LiveMark compact />}
            <span className="mono">{match.homeScore ?? "–"} <em>:</em> {match.awayScore ?? "–"}</span>
            <small>{labelForStatus(match.status)}{["live", "awarded"].includes(match.status) ? ` · ${match.statusDetail}` : ""}</small>
          </div>
          <div className="dialog-team"><TeamBadge team={match.away} size={76} /><strong>{match.away.name}</strong><small>Đội khách</small></div>
        </div>
        <div className="detail-tabs" role="tablist" aria-label="Nội dung chi tiết trận đấu">
          {DETAIL_TABS.map((item, index) => <button key={item.id} role="tab"
            id={`detail-tab-${item.id}`} aria-controls="detail-panel" aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1} onKeyDown={(event) => chooseTabOnKey(event, index)}
            onClick={() => setTab(item.id)}>{item.title}</button>)}
        </div>
        <div className="detail-panel" role="tabpanel" id="detail-panel" aria-labelledby={`detail-tab-${tab}`} tabIndex={0}>
          {tab === "overview" && <div className="detail-facts-grid">
            <div><MapPin size={17} /><span><small>Sân vận động</small><strong>{match.venue ?? "Chưa công bố"}</strong></span></div>
            <div><Tv size={17} /><span><small>Kênh truyền hình (theo nguồn)</small><strong>{match.broadcasters.join(", ") || "Chưa công bố"}</strong></span></div>
            {details?.attendance && <div><Trophy size={17} /><span><small>Khán giả</small><strong>{details.attendance}</strong></span></div>}
            {details?.referee && <div><Activity size={17} /><span><small>Trọng tài</small><strong>{details.referee}</strong></span></div>}
          </div>}
          {tab === "overview" && (match.home.form?.length || match.away.form?.length) ?
            <section className="detail-content-card match-form-card" aria-label="Phong độ gần đây">
              <div className="detail-section-heading"><h3>Phong độ gần đây</h3><small>Trận thắng / hòa / bại theo ESPN</small></div>
              <RecentForm team={match.home} />
              <RecentForm team={match.away} />
            </section> : null}
          {tab === "overview" && details?.headToHead.length ?
            <section className="detail-content-card" aria-label="Lịch sử đối đầu">
              <div className="detail-section-heading"><h3>Đối đầu gần đây</h3><small>Theo ESPN · tối đa 5 trận</small></div>
              <ol className="head-to-head-list">
                {details.headToHead.map((event) => <li key={event.id}>
                  <time dateTime={event.date}>{dateOf(event.date, { month: "2-digit" })}</time>
                  <span className="head-to-head-team">{event.homeId === details.homeId ? match.home.name : match.away.name}</span>
                  <strong className="mono">{event.homeScore} : {event.awayScore}</strong>
                  <span className="head-to-head-team">{event.awayId === details.awayId ? match.away.name : match.home.name}</span>
                </li>)}
              </ol>
            </section> : null}
          {renderDetail()}
        </div>
        <div className="detail-footer">
          <p><Activity size={14} /> Dữ liệu trận: {match.source}. Kênh phát sóng có thể dành cho thị trường khác; video trực tiếp tùy thuộc bản quyền khu vực.</p>
          {match.matchUrl && <a className="dialog-link" href={match.matchUrl} target="_blank" rel="noopener noreferrer">
            {isVietnamLeague(match.leagueId) ? "Xem lịch chính thức trên VPF" : "Xem thông tin trận trên ESPN"} <ExternalLink size={17} /></a>}
        </div>
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
                      <div className="league-section">
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
              <LeagueStandings leagueId={league} />
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
