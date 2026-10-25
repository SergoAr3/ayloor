export function CheckInScan({ stage }: { stage: "location" | "verification" }) {
  return <div className="scan-backdrop"><div className="check-in-sheet" role="region" aria-label="Check-in progress">
    <h2>CLAIM THE<br />CHECKPOINT.</h2>
    <div className="radar-ping" aria-hidden="true"><i /><i /><i /><b /></div>
    <p className="check-in-loading" role="status">{stage === "location" ? "GETTING LOCATION…" : "VERIFYING CHECKPOINT…"}</p>
    <p>Checking your location once…</p>
    <p className="hint">No live tracking. Keep this window open.</p>
  </div></div>;
}
