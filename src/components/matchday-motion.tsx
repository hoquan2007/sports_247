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

  // All character motion is CSS-driven; inactive browser tabs pause every layer.
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const syncVisibility = () => { dock.dataset.paused = String(document.hidden); };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

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

  return (
    <div ref={dockRef} className={`mascot-dock ${celebrating ? "is-celebrating" : ""} ${playing ? "is-playing" : ""}`} data-move={move}>
      {(celebrating && event || playing) && (
        <div className="mascot-message" role="status" aria-live="polite">
          {celebrating && event ? <><strong>VÀO!!!</strong> {event.teamName} · {event.score}</> : <><strong>Bóng Bự:</strong> {messages[move]}</>}
        </div>
      )}
      <button className="mascot-action" type="button" onClick={play} aria-label="Chạm để Bóng Bự vẫy tay, sút bóng hoặc nhảy múa"
        onPointerMove={(pointer) => {
          const bounds = pointer.currentTarget.getBoundingClientRect();
          pointer.currentTarget.style.setProperty("--gaze-x", `${((pointer.clientX - bounds.left) / bounds.width - .5) * 5}px`);
          pointer.currentTarget.style.setProperty("--gaze-y", `${((pointer.clientY - bounds.top) / bounds.height - .5) * 4}px`);
        }}
        onPointerLeave={(pointer) => {
          pointer.currentTarget.style.removeProperty("--gaze-x");
          pointer.currentTarget.style.removeProperty("--gaze-y");
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
