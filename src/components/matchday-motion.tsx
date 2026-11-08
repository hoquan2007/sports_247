"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { VolumeX, X } from "lucide-react";
import type { GoalEvent } from "@/lib/football/goal-event";

gsap.registerPlugin(useGSAP);

export function Football({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" role="img" aria-label="Quả bóng đá" xmlns="http://www.w3.org/2000/svg">
      <circle className="ball-base" cx="60" cy="60" r="56" />
      <path className="ball-seams" d="M60 17 48 34 56 51 77 52 88 35 79 19M48 34 25 39 19 59 33 75 56 70 56 51M77 52 94 62 96 82 78 96 56 88 56 70M33 75 38 97 56 107 78 96M79 19 94 32 106 55 94 62M19 59 10 77 24 95 38 97" />
      <path className="ball-panel" d="M48 34 77 52 70 76 44 78 32 57Z" />
      <path className="ball-panel" d="M60 9 79 19 88 35 75 32 60 17Z" />
      <path className="ball-panel" d="M96 82 108 79 95 100 78 107 78 96Z" />
      <circle className="ball-sheen" cx="39" cy="26" r="10" />
    </svg>
  );
}

export function MatchdayIntro() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visited = false;
    try {
      visited = sessionStorage.getItem("sports247:matchday-intro") === "seen";
    } catch { /* Session storage may be blocked. */ }
    const frame = window.requestAnimationFrame(() => {
      if (reduce || visited) setIsVisible(false);
      else setShouldAnimate(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const skip = useCallback(() => {
    try { sessionStorage.setItem("sports247:matchday-intro", "seen"); } catch { /* Storage is optional. */ }
    setIsVisible(false);
  }, []);

  useGSAP(() => {
    if (!shouldAnimate || !rootRef.current) return;
    const timeline = gsap.timeline({ onComplete: skip });
    // Let the first-visit welcome play on mobile without delaying match content.
    if (window.matchMedia("(max-width: 690px)").matches) timeline.timeScale(2);
    timeline.fromTo(".intro-football", { xPercent: -150, yPercent: 110, rotate: -95, scale: .35, opacity: .2 },
      { xPercent: 0, yPercent: 0, rotate: 0, scale: 1, opacity: 1, duration: .75, ease: "power3.out" })
      .to(".intro-football", { scale: 7, rotate: 100, duration: .66, ease: "power3.in" }, "+=.17")
      .to(".intro-flash", { opacity: 1, duration: .12 }, "<.47")
      .to(".matchday-intro", { opacity: 0, duration: .2 });
    return () => { timeline.kill(); };
  }, { scope: rootRef, dependencies: [shouldAnimate, skip] });

  if (!isVisible) return null;
  return (
    <div className="matchday-intro" ref={rootRef} role="status" aria-label="Đang vào sân bóng">
      <div className="intro-floodlights" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="intro-stadium" aria-hidden="true"><div className="intro-crowd" /></div>
      <div className="intro-stage">
        <div className="intro-label">SPORTS<span>247</span></div>
        <div className="intro-football"><Football className="intro-football-art" /></div>
        <p>It&apos;s matchday.</p>
      </div>
      <div className="intro-flash" aria-hidden="true" />
      <button className="intro-skip" type="button" onClick={skip}>Bỏ qua <X size={15} /></button>
    </div>
  );
}

export function BallLoading({ label = "Đang cập nhật tỷ số" }: { label?: string }) {
  return (
    <div className="ball-loading" role="status">
      <div className="loading-stadium" aria-hidden="true">
        <span className="loading-floodlight loading-floodlight-left" />
        <span className="loading-floodlight loading-floodlight-right" />
        <span className="loading-crowd loading-crowd-back" />
        <span className="loading-crowd loading-crowd-front" />
        <Football className="loading-football" />
      </div>
      <span className="loading-caption">{label}<span className="loading-dots" aria-hidden="true">...</span></span>
    </div>
  );
}

export function MatchdayMascot({ event }: { event: GoalEvent | null }) {
  const [celebrating, setCelebrating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [move, setMove] = useState<"wave" | "kick" | "dance">("dance");
  const timerRef = useRef<number | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const roamRef = useRef<gsap.core.Timeline | null>(null);
  const busyRef = useRef(false);

  const syncCompact = useCallback(() => {
    const dock = dockRef.current;
    if (!dock) return;
    if (window.innerWidth > 690) {
      if (dock.dataset.compact !== "false") dock.dataset.compact = "false";
      return;
    }

    // Use the unscaled dock bounds to avoid the compact state flickering as the
    // mascot shrinks. The companion can still travel and receive a tap.
    const mascot = dock.getBoundingClientRect();
    const important = document.querySelectorAll<HTMLElement>(
      ".date-panel, .stats-strip, .results-heading, .results-toolbar, .spotlight-score, .spotlight-open, .spotlight-controls",
    );
    const nearContent = Array.from(important).some((element) => {
      const area = element.getBoundingClientRect();
      return mascot.left < area.right + 6 && mascot.right > area.left - 6 &&
        mascot.top < area.bottom + 6 && mascot.bottom > area.top - 6;
    });
    const compact = String(nearContent);
    if (dock.dataset.compact !== compact) dock.dataset.compact = compact;
  }, []);

  const syncRoaming = useCallback(() => {
    const dock = dockRef.current;
    const timeline = roamRef.current;
    if (!dock || !timeline) return;
    const paused = document.hidden || busyRef.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      dock.matches(":hover, :focus-within");
    timeline.paused(paused);
    if (paused) dock.dataset.walking = "false";
  }, []);

  useGSAP(() => {
    const dock = dockRef.current;
    const action = dock?.querySelector<HTMLElement>(".mascot-action");
    if (!dock || !action) return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const buildRoute = () => {
      roamRef.current?.kill();
      roamRef.current = null;
      dock.dataset.walking = "false";
      dock.dataset.side = "right";
      gsap.set(dock, { x: 0, y: 0 });
      syncCompact();
      if (motionPreference.matches) return;

      const margin = 14;
      const travelX = Math.max(0, window.innerWidth - action.offsetWidth - margin * 2);
      const travelY = Math.max(0, Math.min(
        window.innerHeight - action.offsetHeight - 28 - 88,
        window.innerWidth <= 600 ? 260 : 520,
      ));
      if (travelX < 24 || travelY < 24) return;

      // Explore the screen perimeter, leaving the central scores and match controls readable.
      const stops = [
        { x: -Math.min(180, travelX * .42), y: 0 },
        { x: -travelX, y: -Math.min(32, travelY * .12) },
        { x: -travelX, y: -travelY * .64 },
        { x: -travelX * .78, y: -travelY },
        { x: -travelX * .2, y: -travelY },
        { x: 0, y: -travelY * .58 },
        { x: 0, y: 0 },
      ];

      const timeline = gsap.timeline({ repeat: -1, repeatDelay: 1.2, paused: true });
      let previous = { x: 0, y: 0 };
      let lastCompactSync = 0;
      for (const stop of stops) {
        const distance = Math.hypot(stop.x - previous.x, stop.y - previous.y);
        timeline.to(dock, {
          x: stop.x,
          y: stop.y,
          duration: Math.max(1.1, distance / 82),
          ease: "sine.inOut",
          onStart: () => { dock.dataset.walking = "true"; },
          onUpdate: () => {
            if (dock.dataset.walking !== "true") dock.dataset.walking = "true";
            const side = Number(gsap.getProperty(dock, "x")) < -travelX / 2 ? "left" : "right";
            if (dock.dataset.side !== side) dock.dataset.side = side;
            // Bounds checks can force layout; limit them during perpetual roaming.
            const now = performance.now();
            if (now - lastCompactSync >= 100) {
              syncCompact();
              lastCompactSync = now;
            }
          },
          onComplete: () => {
            dock.dataset.walking = "false";
            syncCompact();
          },
        }, "+=1.1");
        previous = stop;
      }
      roamRef.current = timeline;
      syncRoaming();
    };

    let resizeFrame = 0;
    const onResize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(buildRoute);
    };
    const onVisibility = () => {
      dock.dataset.paused = String(document.hidden);
      syncRoaming();
    };
    buildRoute();
    onVisibility();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", syncCompact, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    motionPreference.addEventListener("change", buildRoute);
    return () => {
      window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", syncCompact);
      document.removeEventListener("visibilitychange", onVisibility);
      motionPreference.removeEventListener("change", buildRoute);
      roamRef.current?.kill();
      roamRef.current = null;
    };
  }, { scope: dockRef, dependencies: [syncRoaming, syncCompact] });

  useEffect(() => {
    busyRef.current = playing || celebrating;
    syncRoaming();
  }, [playing, celebrating, syncRoaming]);

  useEffect(() => {
    if (!event) return;
    const start = window.setTimeout(() => setCelebrating(true), 0);
    const end = window.setTimeout(() => setCelebrating(false), 6500);
    return () => { window.clearTimeout(start); window.clearTimeout(end); };
  }, [event]);
  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }, []);

  const play = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setMove((previous) => previous === "wave" ? "kick" : previous === "kick" ? "dance" : "wave");
    setPlaying(true);
    timerRef.current = window.setTimeout(() => setPlaying(false), 2400);
  };

  const messages = { wave: "Xin chào! Cùng cổ vũ nhé!", kick: "Sút! Đường bóng tuyệt đẹp!", dance: "Nhảy mừng cùng SPORTS247!" };
  const shortMessages = { wave: "Xin chào!", kick: "Sút bóng!", dance: "Quẩy nào!" };

  return (
    <div ref={dockRef} className={`mascot-dock ${celebrating ? "is-celebrating" : ""} ${playing ? "is-playing" : ""}`} data-move={move} data-walking="false" data-side="right" data-compact="false">
      {(celebrating && event || playing) && (
        <div className="mascot-message" role="status" aria-live="polite">
          <span className="mascot-message-full">{celebrating && event ? <><strong>VÀO!!!</strong> {event.teamName} · {event.score}</> : <><strong>Bóng Bự:</strong> {messages[move]}</>}</span>
          <span className="mascot-message-short">{celebrating && event ? "VÀO!!!" : shortMessages[move]}</span>
        </div>
      )}
      <button className="mascot-action" type="button" onClick={play} aria-label="247 – Chạm để Bóng Bự vẫy tay, sút bóng hoặc nhảy múa"
        onPointerEnter={syncRoaming}
        onFocus={syncRoaming} onBlur={() => window.requestAnimationFrame(syncRoaming)}
        onPointerMove={(pointer) => {
          const bounds = pointer.currentTarget.getBoundingClientRect();
          pointer.currentTarget.style.setProperty("--gaze-x", `${((pointer.clientX - bounds.left) / bounds.width - .5) * 5}px`);
          pointer.currentTarget.style.setProperty("--gaze-y", `${((pointer.clientY - bounds.top) / bounds.height - .5) * 4}px`);
        }}
        onPointerLeave={(pointer) => {
          pointer.currentTarget.style.removeProperty("--gaze-x");
          pointer.currentTarget.style.removeProperty("--gaze-y");
          window.requestAnimationFrame(syncRoaming);
        }}>
        <span className="mascot-stage" aria-hidden="true">
          <span className="mascot-aura" />
          <span className="mascot-spark spark-one" /><span className="mascot-spark spark-two" /><span className="mascot-spark spark-three" /><span className="mascot-spark spark-four" />
          <span className="mascot-shadow" />
          <span className="mascot-figure">
            <span className="mascot-arm left"><i /></span><span className="mascot-arm right"><i /></span>
            <span className="mascot-foot left" /><span className="mascot-foot right" />
            <span className="mascot-body">
              <Football className="mascot-football" />
              <span className="mascot-face">
                <span className="mascot-brow left" /><span className="mascot-brow right" />
                <span className="mascot-eye left" /><span className="mascot-eye right" />
                <span className="mascot-cheek left" /><span className="mascot-cheek right" />
                <span className="mascot-smile" />
              </span>
            </span>
            <span className="mascot-scarf" /><span className="mascot-scarf-tail" />
            <span className="mascot-number">247</span>
          </span>
        </span>
      </button>
      <span className="mascot-muted"><VolumeX size={11} /> Chạm để chơi · Không âm thanh</span>
    </div>
  );
}
