"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import Link from "next/link";
import { Activity, CalendarDays, ChevronRight, ExternalLink, Info, Link2, MapPin, RefreshCw, Trophy, Tv, X } from "lucide-react";
import { LeagueBadge } from "@/components/league-badge";
import { TeamBadge, LiveMark, dateOf, labelForStatus, timeOf } from "@/components/match-center-ui";
import { isVietnamLeague } from "@/lib/football/vietnam-leagues";
import { vietnamDate } from "@/lib/football/leagues";
import { matchPermalink } from "@/lib/football/match-link";
import type { DetailEvent, DetailLineup, DetailStatistic, MatchDetails } from "@/lib/football/match-details";
import type { FootballMatch, FootballTeam } from "@/lib/football/types";
import type { WatchResult } from "@/lib/football/watch";

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

export function MatchDialog({ match, onClose, mode = "overlay", initialDetails = null }: {
  match: FootballMatch;
  onClose?: () => void;
  mode?: "overlay" | "page";
  initialDetails?: MatchDetails | null;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const activeDetailRequest = useRef<AbortController | null>(null);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [details, setDetails] = useState<MatchDetails | null>(initialDetails);
  const [detailError, setDetailError] = useState(false);
  const [retryNumber, setRetryNumber] = useState(0);
  const [watch, setWatch] = useState<WatchResult | null>(null);
  const [watchError, setWatchError] = useState(false);
  const [watchRetry, setWatchRetry] = useState(0);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "unavailable">("idle");
  const supported = match.source === "ESPN";
  const permalink = matchPermalink(match);
  const calendarUrl = `/?date=${vietnamDate(match.startTime)}`;
  const watchSupported = supported || (match.source === "API-Football" && isVietnamLeague(match.leagueId));

  const copyMatchLink = async () => {
    if (!permalink) return;
    try {
      await navigator.clipboard.writeText(new URL(permalink, window.location.origin).href);
      setShareStatus("copied");
    } catch {
      setShareStatus("unavailable");
    }
  };

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
    if (mode === "page") return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose?.(); return; }
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
  }, [onClose, mode]);

  useEffect(() => {
    if (!supported) return;
    if (mode === "page" && initialDetails && match.status !== "live" && retryNumber === 0) return;
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
  }, [match.leagueId, match.eventId, match.status, retryNumber, supported, mode, initialDetails]);

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
    <div className={mode === "page" ? "match-page-shell" : "dialog-backdrop"} role="presentation"
      onMouseDown={mode === "overlay" ? (event) => { if (event.target === event.currentTarget) onClose?.(); } : undefined}>
      <section className={`match-dialog${mode === "page" ? " match-dialog-page" : ""}`}
        role={mode === "page" ? "region" : "dialog"} aria-modal={mode === "page" ? undefined : true}
        aria-label={`Chi tiết ${match.home.name} - ${match.away.name}`} ref={dialogRef}>
        <div className="dialog-topline">
          <span className="eyebrow dialog-league-label">TRUNG TÂM TRẬN ĐẤU <span className="dialog-separator">/</span> <LeagueBadge leagueId={match.leagueId} size={26} /> {match.leagueName}</span>
          {mode === "page"
            ? <Link href={calendarUrl} className="icon-button" aria-label="Trở về lịch thi đấu"><X size={20} /></Link>
            : <button onClick={onClose} className="icon-button" aria-label="Đóng" ref={closeRef}><X size={20} /></button>}
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
          {permalink && <div className="detail-share-controls">
            {mode === "overlay" && <Link className="dialog-link" href={permalink}>Trang trận đấu <ExternalLink size={15} /></Link>}
            <button type="button" className="dialog-link" onClick={() => void copyMatchLink()}><Link2 size={15} /> Sao chép liên kết</button>
            <span role="status" aria-live="polite" className="detail-share-status">
              {shareStatus === "copied" ? "Đã sao chép" : shareStatus === "unavailable" ? "Không thể sao chép tự động" : ""}
            </span>
          </div>}
          {match.matchUrl && <a className="dialog-link" href={match.matchUrl} target="_blank" rel="noopener noreferrer">
            {isVietnamLeague(match.leagueId) ? "Xem lịch chính thức trên VPF" : "Xem thông tin trận trên ESPN"} <ExternalLink size={17} /></a>}
        </div>
      </section>
    </div>
  );
}
