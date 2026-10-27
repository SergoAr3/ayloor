import { useEffect, useState } from "react";
import { ActionButton } from "./ui";
import type { Quest } from "../types";

export function FieldAnswer({ quest, busy, feedback, answer, hint }: {
  quest: Quest; busy: boolean; feedback: string;
  answer: (text: string) => void; hint: () => void;
}) {
  const [text, setText] = useState("");
  const [confirmHint, setConfirmHint] = useState(false);
  useEffect(() => { setText(""); setConfirmHint(false); }, [quest.id]);
  const verified = !!quest.run?.gps_verified_at;
  return <section className="field-answer" aria-label="FIELD TEST answer">
    <p className="eyebrow">{verified ? "GPS VERIFIED ✓ · ENTER CODE" : "CHECK IN BEFORE ENTERING CODE"}</p>
    <p>Wrong answers cost −25 XP once per quest. Further wrong answers cost no extra XP.</p>
    {quest.wrong_answer_penalized && <p className="hint">Wrong-answer penalty already applied: −25 XP.</p>}
    {feedback && <p role="status" className="field-feedback">{feedback}</p>}
    {quest.hint_text && <p className="field-hint">{quest.hint_text}<br /><small>Hint used · −50 XP already applied.</small></p>}
    {!quest.locked && quest.run?.status === "started" && <>
      <form onSubmit={event => { event.preventDefault(); if (verified && text.trim() && !busy) answer(text); }}>
        <label>Test code<input autoComplete="off" autoCapitalize="characters" maxLength={200} value={text} disabled={busy || !verified} onChange={event => setText(event.target.value)} /></label>
        <ActionButton type="submit" disabled={busy || !verified || !text.trim()}>SUBMIT ANSWER</ActionButton>
      </form>
      {quest.hint_available && !quest.hint_used && (confirmHint ? <div className="field-hint-confirm" role="group" aria-label="Confirm hint penalty">
        <p>Reveal this hint for −50 XP? Your team pays once.</p>
        <ActionButton secondary disabled={busy} onClick={hint}>REVEAL HINT · −50 XP</ActionButton>
        <button className="text-action" disabled={busy} onClick={() => setConfirmHint(false)}>CANCEL</button>
      </div> : <ActionButton secondary disabled={busy || !verified} onClick={() => setConfirmHint(true)}>HINT · −50 XP</ActionButton>)}
    </>}
  </section>;
}
