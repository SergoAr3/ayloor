import { useEffect, useRef, useState } from "react";
import { ActionButton } from "../components/ui";
import { exploreApi, type ArrivalState, type Run } from "./api";
import { requestLocation } from "./geolocation";

type Outcome = "confirmed" | "low_accuracy" | "uncertain" | "outside" | "stale_sample";
const messages: Record<Outcome, string> = {
  confirmed: "Arrival confirmed.",
  low_accuracy: "Location accuracy is too low. Try again from a safe open area, or use the directions.",
  uncertain: "Location overlaps the checkpoint boundary. Arrival is uncertain. You can retry or use the directions.",
  outside: "This location is outside the checkpoint. Follow the directions using safe public paths.",
  stale_sample: "This location sample is too old or your device clock is incorrect. Please retry or use the directions.",
};

export default function Arrival({ run, credential, disabled, onArrival }: {
  run: Run; credential: string; disabled: boolean; onArrival: (state: ArrivalState) => void;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);

  async function locate() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setMessage("Requesting location…");
    try {
      const sample = await requestLocation(controller.signal);
      if (controller.signal.aborted) return;
      setMessage("Checking arrival…");
      const result = await exploreApi<{ outcome: Outcome; run: Run }>(`/runs/${run.id}/arrival`, credential, { stop_id: run.stop.id, ...sample });
      if (controller.signal.aborted) return;
      // Only consume Arrival: an overlapping Answer may already have entered Reveal.
      // Never restore an older progression snapshot from this independent request.
      if (result.run.stop.id === run.stop.id && result.run.phase !== "finished") onArrival(result.run.arrival);
      setMessage(messages[result.outcome]);
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to check arrival. Resume saved progress or retry.");
    } finally {
      if (!controller.signal.aborted) { request.current = null; setPending(false); }
    }
  }

  return <aside aria-label="Optional arrival">
    <p>Location is optional. Directions and answering remain available.</p>
    {run.arrival.status === "confirmed" ? <p role="status">Arrival previously confirmed at <time dateTime={run.arrival.confirmed_at!}>{new Date(run.arrival.confirmed_at!).toLocaleString()}</time>. This is a saved check, not your current location.</p> : <>
      <ActionButton secondary disabled={disabled || pending} onClick={() => void locate()}>CHECK ARRIVAL</ActionButton>
      {message && <p role="status">{message}</p>}
    </>}
  </aside>;
}
