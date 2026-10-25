import { useEffect, useState } from "react";
import type { Coordinates, Quest } from "../types";
import { QuestZoneMap } from "./QuestZoneMap";

function PlacePhoto({ url, label }: { url?: string | null; label?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // Admin-authored HTTPS images only; no prototype image becomes a default place.
  const safe = url && /^https:\/\//i.test(url) && failedUrl !== url;
  return safe ? <img className="place-photo" src={url} alt={label ? `Checkpoint: ${label}` : "Checkpoint place photo"} referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
    : <p className="place-empty">{url ? "Place photo is unavailable." : "No place photo has been added yet."}</p>;
}

// API hint contains only the hint text; this view owns the "Look for:" label.
export function QuestContent({ quest, sample, sampleAge, revealMap = false }: { quest: Quest; sample?: Coordinates | null; sampleAge?: string | null; revealMap?: boolean }) {
  const [view, setView] = useState<"map" | "place">("map");
  useEffect(() => { if (revealMap) setView("map"); }, [revealMap]);
  return <div className="quest-content">
    <div className="content-switch" role="group" aria-label="Quest view">
      <button aria-pressed={view === "map"} onClick={() => setView("map")}>MAP <small>WHERE TO GO</small></button>
      <button aria-pressed={view === "place"} onClick={() => setView("place")}>PLACE <small>WHAT TO RECOGNIZE</small></button>
    </div>
    {view === "map" ? <QuestZoneMap quest={quest} sample={sample} sampleAge={sampleAge} showSummary={false} /> : <div className="place-content">
      <PlacePhoto url={quest.hero_image_url} label={quest.place_label} />
      {quest.place_label && <h2>{quest.place_label}</h2>}
      <p><strong>Look for:</strong> {quest.look_for_hint || "No recognition hint has been added yet. Use the checkpoint coordinates and stay on public paths."}</p>
    </div>}
  </div>;
}
