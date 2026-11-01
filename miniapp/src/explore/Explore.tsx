import { useCallback, useEffect, useRef, useState } from "react";
import Arrival from "./Arrival";
import { ActionButton, ErrorNotice } from "../components/ui";
import { ApiError, ApiTransportError } from "../apiErrors";
import { exploreApi, guideSlug, loadSaved, newStartKey, save, storageKey, type Guide, type Run, type Saved, type Start } from "./api";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Unable to continue. Please retry.";

export default function Explore() {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [needsResume, setNeedsResume] = useState(false);
  const busyRef = useRef(false);
  const epoch = useRef(0);

  const restore = useCallback(async () => {
    const current = ++epoch.current;
    setLoading(true); setError("");
    try {
      const stored = loadSaved();
      setSaved(stored);
      const info = await exploreApi<Guide>(`/guides/${guideSlug}`);
      const state = stored && "credential" in stored
        ? await exploreApi<Run>(`/runs/${stored.runId}`, stored.credential) : null;
      if (current !== epoch.current) return;
      setGuide(info); setRun(state); setNeedsResume(false); setText(""); setFeedback("");
    } catch (e) { if (current === epoch.current) { setError(errorMessage(e)); setNeedsResume(true); } }
    finally { if (current === epoch.current) setLoading(false); }
  }, []);

  useEffect(() => {
    void restore();
    const visible = () => { if (!document.hidden && !busyRef.current) void restore(); };
    const storage = (event: StorageEvent) => { if (event.key === storageKey) void restore(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("storage", storage);
    return () => { epoch.current++; document.removeEventListener("visibilitychange", visible); window.removeEventListener("storage", storage); };
  }, [restore]);

  async function act(work: () => Promise<void>) {
    if (busyRef.current) return;
    const current = epoch.current;
    busyRef.current = true; setBusy(true); setError(""); setFeedback("");
    try { await work(); }
    catch (e) {
      if (current === epoch.current) {
        setError(errorMessage(e));
        // A write may have committed. Block further writes until a read reconciles it.
        if (e instanceof ApiTransportError || (e instanceof ApiError && [401, 409].includes(e.status))) setNeedsResume(true);
      }
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function start() {
    // Persist the secret retry key BEFORE the request. No run starts if storage fails.
    const current = epoch.current;
    const existing = loadSaved();
    if (existing && "credential" in existing) { await restore(); return; }
    const pending = existing && "startKey" in existing ? existing : { startKey: newStartKey() };
    save(pending); setSaved(pending);
    const result = await exploreApi<Start>(`/guides/${guideSlug}/runs`, undefined, { start_key: pending.startKey });
    if (current !== epoch.current) return;
    const credential = { runId: result.run.id, credential: result.credential };
    save(credential); setSaved(credential); setRun(result.run); setNeedsResume(false);
  }

  async function mutate(kind: "hint" | "answer" | "continue") {
    if (!run || !saved || !("credential" in saved)) return;
    const current = epoch.current;
    const body = { stop_id: run.stop.id, ...(kind === "answer" ? { answer: text } : {}) };
    if (kind === "answer") {
      const result = await exploreApi<{ accepted: boolean; run: Run }>(`/runs/${run.id}/answer`, saved.credential, body);
      if (current !== epoch.current) return;
      setRun(current => current?.id === result.run.id && current.stop.id === result.run.stop.id
        && result.run.phase !== "finished" && current.arrival.status === "confirmed"
        ? { ...result.run, arrival: current.arrival } : result.run);
      setFeedback(result.accepted ? "" : "That is not the answer. Look again or try the free hint.");
    } else {
      const result = await exploreApi<Run>(`/runs/${run.id}/${kind}`, saved.credential, body);
      if (current !== epoch.current) return;
      setRun(current => kind === "hint" && current?.id === result.id && current.stop.id === result.stop.id
        && result.phase !== "finished" && current.arrival.status === "confirmed"
        ? { ...result, arrival: current.arrival } : result);
    }
    setText("");
  }

  const disabled = busy || loading || needsResume;
  return <main className="app explore-page">
    <header className="brand"><span className="wordmark">AYLOOR</span><span>EXPLORE / DEMO</span></header>
    <p className="eyebrow">A CITY GUIDE YOU PLAY</p>
    <h1>{guide?.title || "Explore flow demo"}</h1>
    <p>Two synthetic steps. This is a flow test, not a real city walk.</p>
    {loading && <p role="status">Loading saved progress…</p>}
    {error && <ErrorNotice>{error}</ErrorNotice>}
    {(needsResume || error) && <ActionButton secondary disabled={busy || loading} onClick={() => void restore()}>RESUME / RETRY</ActionButton>}
    {!run && guide && !loading && <section aria-label="Start demo">
      <p>No account, Telegram or team needed. No timer. Resume in this browser on this device; clearing site data loses access. Internet is required.</p>
      <ActionButton disabled={busy || (needsResume && !(saved && "startKey" in saved))} onClick={() => void act(start)}>{saved && "startKey" in saved ? "RESUME START" : "START DEMO"}</ActionButton>
    </section>}
    {run && !loading && <section aria-label="Guide progress">
      <p className="eyebrow">STOP {run.stop.position} / {run.guide.stop_count}</p>
      {run.phase === "finished" ? <><h2>FINISH</h2><p>You completed the demo.</p><p>{run.stop.reveal}</p></> : <>
        <h2>{run.stop.title}</h2>
        {run.stop.directions && <p>Directions: {run.stop.directions}</p>}
        {run.stop.checkpoint && saved && "credential" in saved && <Arrival
          key={`${run.id}:${run.stop.id}`} run={run} credential={saved.credential} disabled={disabled}
          onArrival={arrival => setRun(current => current && current.id === run.id && current.stop.id === run.stop.id
            && current.phase !== "finished" && current.arrival.status !== "confirmed" ? { ...current, arrival } : current)}
        />}
        {run.phase === "clue" ? <>
          <p>{run.stop.clue}</p>
          {run.stop.hint ? <p role="note">Hint: {run.stop.hint}</p> : <ActionButton secondary disabled={disabled} onClick={() => void act(() => mutate("hint"))}>FREE HINT</ActionButton>}
          <form onSubmit={event => { event.preventDefault(); if (!disabled && text.trim()) void act(() => mutate("answer")); }}>
            <label>Answer<input autoComplete="off" maxLength={200} value={text} disabled={disabled} onChange={event => setText(event.target.value)} /></label>
            <ActionButton type="submit" disabled={disabled || !text.trim()}>CHECK ANSWER</ActionButton>
          </form>
          {feedback && <p role="status">{feedback}</p>}
        </> : <><h3>REVEAL</h3><p>{run.stop.reveal}</p><ActionButton disabled={disabled} onClick={() => void act(() => mutate("continue"))}>CONTINUE</ActionButton></>}
      </>}
      <ActionButton secondary disabled={busy || loading} onClick={() => void restore()}>RESUME SAVED PROGRESS</ActionButton>
      <p>You can close this page and resume later in the same browser.</p>
    </section>}
  </main>;
}
