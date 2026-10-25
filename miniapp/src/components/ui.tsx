import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Team } from "../types";

export type Screen = "home" | "team" | "quests" | "quest" | "leaderboard" | "complete";

export function ArrowIcon({ direction = "right" }: { direction?: "outbound" | "left" | "right" }) {
  const paths = { outbound: "M5 19 19 5M5 5h14v14", left: "M20 12H4m7-7-7 7 7 7", right: "M4 12h16m-7-7 7 7-7 7" };
  return <svg className="arrow-icon" data-icon={direction} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true"><path d={paths[direction]} /></svg>;
}

function BrandMark() {
  return <svg className="brand-mark" data-icon="brand" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><circle cx="6" cy="6" r="4" /></svg>;
}

export function CopyIcon() {
  return <svg className="arrow-icon" data-icon="copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true"><path d="M9 9h12v12H9zM5 15H3V3h12v2" /></svg>;
}

export function AppHeader({ home, busy, showTicker = true }: { home: () => void; busy: boolean; showTicker?: boolean }) {
  return <><header className="brand"><button className="wordmark" onClick={home} disabled={busy} aria-label="AYLOOR Home">AYLOOR<span><BrandMark /></span></button><div>YEREVAN<span>SEASON ZERO</span></div></header>{showTicker && <div className="marquee" aria-label="Play the real world. Yerevan. Season Zero."><div className="marquee-track" aria-hidden="true">{[0, 1, 2, 3].map(copy => <span key={copy}>PLAY THE REAL WORLD <b>★</b> YEREVAN <b>★</b> SEASON ZERO <b>★</b> </span>)}</div></div>}</>;
}

export function QuestDetailHeader({ back, home, busy }: { back: () => void; home: () => void; busy: boolean }) {
  return <header className="quest-detail-header"><button className="back quest-back" onClick={back} disabled={busy}><ArrowIcon direction="left" />ALL QUESTS</button><button className="wordmark" onClick={home} disabled={busy} aria-label="AYLOOR Home">AYLOOR<span><BrandMark /></span></button></header>;
}

export function ActionButton({ children, secondary, arrow = true, className = "", disabled, onPointerDown, onPointerUp, onPointerCancel, onPointerLeave, onTouchStart, onTouchEnd, onTouchCancel, onBlur, onKeyDown, onKeyUp, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean; arrow?: boolean }) {
  const [pressed, setPressed] = useState(false);
  useEffect(() => { if (disabled) setPressed(false); }, [disabled]);
  // Presentation only: no synthetic click, pointer capture, preventDefault or gameplay call.
  // Pointer cancellation/scrolling and keyboard release all restore the resting state.
  return <button {...props} disabled={disabled} className={`action${secondary ? " secondary" : ""}${className ? ` ${className}` : ""}`} data-pressed={pressed || undefined}
    onPointerDown={event => { if (!disabled && event.button === 0) setPressed(true); onPointerDown?.(event); }}
    onPointerUp={event => { setPressed(false); onPointerUp?.(event); }}
    onPointerCancel={event => { setPressed(false); onPointerCancel?.(event); }}
    onPointerLeave={event => { setPressed(false); onPointerLeave?.(event); }}
    onTouchStart={event => { if (!("PointerEvent" in window) && !disabled) setPressed(true); onTouchStart?.(event); }}
    onTouchEnd={event => { setPressed(false); onTouchEnd?.(event); }}
    onTouchCancel={event => { setPressed(false); onTouchCancel?.(event); }}
    onBlur={event => { setPressed(false); onBlur?.(event); }}
    onKeyDown={event => { if (event.key === " " || event.key === "Enter") setPressed(true); onKeyDown?.(event); }}
    onKeyUp={event => { setPressed(false); onKeyUp?.(event); }}
  ><span>{children}</span>{arrow && <ArrowIcon direction="right" />}</button>;
}

function NavIcon({ id }: { id: string }) {
  const paths: Record<string, string> = {
    home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
    quests: "M6 3h12v18H6zM9 7h6M9 11h6M9 15h4",
    leaderboard: "M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7",
    team: "M8 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0M4 21v-3a8 6 0 0 1 16 0v3",
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[id]} /></svg>;
}

export function BottomNav({ screen, busy, navigate }: { screen: Screen; busy: boolean; navigate: (screen: Screen) => void }) {
  return <nav aria-label="Main navigation">{([
    ["home", "HOME"], ["quests", "QUESTS"], ["leaderboard", "RANKS"], ["team", "TEAM"],
  ] as const).map(([id, label]) => <button key={id} disabled={busy} onClick={() => navigate(id)} aria-current={screen === id || (id === "quests" && screen === "quest") ? "page" : undefined}><NavIcon id={id} />{label}</button>)}</nav>;
}

export function TeamStatus({ team }: { team: Team }) {
  return <p className={`team-state ${team.status}`}><span className={`status-dot ${team.status}`} aria-hidden="true" />{team.status === "active" ? "ACTIVE TEAM" : team.status === "pending" ? "WAITING FOR PLAYERS" : "TEAM BLOCKED"}</p>;
}

export function CityArtwork({ label = "YEREVAN / SEASON ZERO" }: { label?: string }) {
  return <figure className="city-art"><img src="/assets/street-frequency/yerevan-collage.png" alt="Yerevan and Ararat in a halftone city collage" width="1120" height="689" /><figcaption>{label}</figcaption></figure>;
}

export function ErrorNotice({ children, dismiss }: { children: ReactNode; dismiss?: () => void }) {
  return <div className="error" role="alert"><div>{children}</div>{dismiss && <button className="quiet" onClick={dismiss} aria-label="Dismiss error">×</button>}</div>;
}

export function StatBlock({ label, children }: { label: string; children: ReactNode }) {
  return <div className="stat"><span>{label}</span><strong>{children}</strong></div>;
}
