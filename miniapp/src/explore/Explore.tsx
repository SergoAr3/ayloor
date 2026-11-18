import { useCallback, useEffect, useRef, useState } from "react";
import Arrival from "./Arrival";
import { ActionButton, ErrorNotice } from "../components/ui";
import { ApiError, ApiTransportError } from "../apiErrors";
import { exploreApi, newStartKey, type Guide, type Run, type Start } from "./api";
import { entryGuide, entryUrl, lastGuideKey, legacyStorageKey, loadSaved, previousWalkLink, remember, restoreWalk, save, storageKey, type Saved } from "./session";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Unable to continue. Please retry.";

export default function Explore() {
  const [previous, setPrevious] = useState<string | null>(null);
  const selectedSlug = useRef<string | null>(null);
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
    setLoading(true); setError(""); setGuide(null); setRun(null); setSaved(null); setPrevious(null);
    try {
      const entry = entryGuide(window.location.search);
      setPrevious(previousWalkLink(entry));
      const state = await restoreWalk(entry);
      if (current !== epoch.current) return;
      const latest = loadSaved(state.slug);
      if (state.migrate && state.saved) {
        if (latest) throw new Error("Saved access changed in another tab. Resume again.");
        save(state.slug, state.saved);
      } else if (JSON.stringify(latest) !== JSON.stringify(state.saved)) {
        throw new Error("Saved access changed in another tab. Resume again.");
      } else if (state.saved) remember(state.slug);
      selectedSlug.current = state.slug;
      // A bare resume entry becomes a stable version link, even if another tab
      // later changes the last-guide pointer.
      if (!entry) window.history.replaceState(null, "", entryUrl(state.slug));
      setGuide(state.guide); setSaved(state.saved); setRun(state.run);
      setNeedsResume(false); setText(""); setFeedback("");
    } catch (e) { if (current === epoch.current) { setError(errorMessage(e)); setNeedsResume(true); } }
    finally { if (current === epoch.current) setLoading(false); }
  }, []);

  useEffect(() => {
    void restore();
    const visible = () => { if (!document.hidden && !busyRef.current) void restore(); };
    const storage = (event: StorageEvent) => {
      const relevant = selectedSlug.current ? event.key === storageKey(selectedSlug.current)
        : event.key === lastGuideKey || event.key === legacyStorageKey;
      if (event.key === null || relevant) void restore();
    };
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
    if (!guide) return;
    const existing = loadSaved(guide.slug);
    if (existing && "credential" in existing) { await restore(); return; }
    const pending = existing && "startKey" in existing ? existing : { startKey: newStartKey() };
    save(guide.slug, pending); setSaved(pending);
    const result = await exploreApi<Start>(`/guides/${guide.slug}/runs`, undefined, { start_key: pending.startKey });
    if (current !== epoch.current) return;
    if (result.run.guide.slug !== guide.slug) throw new Error("Started walk does not match this link. Resume to check saved progress.");
    const credential = { runId: result.run.id, credential: result.credential };
    save(guide.slug, credential); setSaved(credential); setRun(result.run); setNeedsResume(false);
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
    <header className="brand"><span className="wordmark">AYLOOR</span><span>EXPLORE</span></header>
    <p className="eyebrow">A CITY GUIDE YOU PLAY</p>
    <h1>{guide?.title || "Explore"}</h1>
    {guide && <><p>{guide.description}</p><p>{guide.stop_count} stops</p></>}
    {previous && <p><a href={previous}>RESUME PREVIOUS WALK</a></p>}
    {loading && <p role="status">Loading saved progress…</p>}
    {error && <ErrorNotice>{error}</ErrorNotice>}
    {(needsResume || error) && <ActionButton secondary disabled={busy || loading} onClick={() => void restore()}>RESUME / RETRY</ActionButton>}
    {!run && guide && !loading && <section aria-label="Start walk">
      <p>No account, Telegram or team needed. No timer. Resume in this browser on this device; clearing site data loses access. Internet is required.</p>
      <ActionButton disabled={busy || (needsResume && !(saved && "startKey" in saved))} onClick={() => void act(start)}>{saved && "startKey" in saved ? "RESUME START" : "START WALK"}</ActionButton>
    </section>}
    {run && !loading && <section aria-label="Guide progress">
      <p className="eyebrow">STOP {run.stop.position} / {run.guide.stop_count}</p>
      {run.phase === "finished" ? <><h2>FINISH</h2><p>You completed {run.guide.title}.</p><p>{run.stop.reveal}</p></> : <>
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
