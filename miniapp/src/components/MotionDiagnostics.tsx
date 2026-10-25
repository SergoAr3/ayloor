import { useEffect, useState } from "react";

function snapshot() {
  const selectors = [".marquee-track", ".radar-ping i", ".xp", ".quest-state.active", ".quest-live-beacon > .status-dot", ".quest-idle-ring", ".reward-halftone", ".action[data-pressed]"];
  return {
    at: performance.now(),
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    visibility: document.visibilityState,
    userAgent: navigator.userAgent,
    elements: selectors.flatMap(selector => [...document.querySelectorAll<HTMLElement>(selector)].map((element, index) => {
      const style = getComputedStyle(element);
      return { selector, index, className: element.className, transform: style.transform, backgroundPosition: style.backgroundPosition, opacity: style.opacity, x: element.getBoundingClientRect().x,
        animationName: style.animationName, animationDuration: style.animationDuration, animationPlayState: style.animationPlayState };
    })),
  };
}

// Opt-in, development-only diagnostics. Reads rendered state; never requests GPS or API.
export function MotionDiagnostics() {
  const [report, setReport] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timers = new Set<number>();
    const observe = (event: AnimationEvent) => {
      if (!["completion-stamp", "check-in-ping", "quest-active-pulse", "quest-idle-beacon", "reward-halftone-drift"].includes(event.animationName)) return;
      const before = snapshot();
      const timer = window.setTimeout(() => { timers.delete(timer); setReport({ trigger: event.animationName, before, after: snapshot() }); }, 650);
      timers.add(timer);
    };
    document.addEventListener("animationstart", observe);
    return () => { document.removeEventListener("animationstart", observe); timers.forEach(clearTimeout); };
  }, []);
  async function measure() {
    setBusy(true);
    const before = snapshot();
    await new Promise(resolve => window.setTimeout(resolve, 1200));
    setReport({ trigger: "manual 1200ms sample", before, after: snapshot() });
    setBusy(false);
  }
  return <details className="motion-diagnostics"><summary>MOTION DIAGNOSTICS · DEV ONLY</summary>
    <p>Actual reduced motion: <strong>{String(matchMedia("(prefers-reduced-motion: reduce)").matches)}</strong>. This panel only reads the rendered UI.</p>
    <button disabled={busy} onClick={() => { void measure(); }}>{busy ? "MEASURING…" : "MEASURE 1.2 SECONDS"}</button>
    <pre tabIndex={0}>{JSON.stringify(report, null, 2)}</pre>
  </details>;
}
