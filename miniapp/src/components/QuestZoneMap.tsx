import { useLayoutEffect, useRef, useState } from "react";
import { ArrowIcon } from "./ui";
import { formatCheckInDistance, isFarCheckIn, mapsLink, sampleDistance } from "../questState";
import type { Coordinates, Quest } from "../types";

// Presentation only. Never requests GPS or decides whether a run is completed.
export function zoneFix(quest: Quest, sample?: Coordinates | null) {
  const distance = sample ? sampleDistance(sample, quest) : null;
  const radius = quest.radius_m;
  if (distance == null || radius == null || !Number.isFinite(radius) || radius <= 0) return null;
  const radians = Math.PI / 180;
  const lat1 = quest.latitude! * radians, lat2 = sample!.latitude * radians;
  const delta = (sample!.longitude - quest.longitude!) * radians;
  const bearing = Math.atan2(Math.sin(delta) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(delta));
  return { far: isFarCheckIn(distance, radius), bearing, radius, distance, outside: Math.max(0, distance - radius), accuracy: sample!.horizontal_accuracy };
}

// Coordinates are CSS pixels: the SVG viewport always matches its measured box.
export function zoneLayout(fix: ReturnType<typeof zoneFix>, width: number, height: number) {
  const cx = width * (fix?.far ? .68 : .5), cy = fix?.far ? height * .46 : fix ? Math.min(Math.max(height * .5, 105), height - 65) : height * .5;
  const radius = !fix ? Math.min(70, height * .44, width * .22) : fix.far ? Math.min(32, height * .28, width * .16) : Math.min(40, height * .18, width * .16);
  const dx = Math.sin(fix?.bearing ?? 0), dy = -Math.cos(fix?.bearing ?? 0);
  // 24px clear space includes the 5px dot and its 3px outline.
  const margin = 31;
  const edge = Math.min((dx > 0 ? width - margin - cx : cx - margin) / Math.abs(dx), (dy > 0 ? height - margin - cy : cy - margin) / Math.abs(dy));
  const length = fix ? Math.min(fix.distance / fix.radius * radius, edge) : 0;
  const x = cx + dx * length, y = cy + dy * length;
  return { cx, cy, radius, x, y,
    zoneX: cx + (fix?.outside ? dx * radius : 0), zoneY: cy + (fix?.outside ? dy * radius : 0),
    labelX: Math.max(78, Math.min(width - 78, x)), labelY: length < radius * .6 ? Math.max(cy + 32, y + 36) : y < 48 ? y + 36 : y - 16,
  };
}

export function QuestZoneMap({ quest, sample, showSummary = true, sampleAge = "JUST NOW" }: { quest: Quest; sample?: Coordinates | null; showSummary?: boolean; sampleAge?: string | null }) {
  const fix = sampleAge ? zoneFix(quest, sample) : null;
  const maps = mapsLink(quest);
  const canvas = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 300, height: 220 });
  useLayoutEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width > 0 && height > 0) setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const g = zoneLayout(fix, size.width, size.height);
  const left = g.cx - g.radius, breakX = Math.max(72, (left + 40) / 2);
  return <figure className="zone-map" aria-label="Checkpoint zone map">
    {showSummary && <div className="zone-summary"><span>{quest.radius_m != null ? `${quest.radius_m} M` : "RADIUS UNAVAILABLE"}</span><span>TEAM QUEST</span><span>+{quest.base_xp} XP</span></div>}
    {maps && quest.radius_m != null && quest.radius_m > 0 ? <div className={`zone-map-canvas${fix?.far ? " is-far" : fix ? "" : " is-idle"}`} ref={canvas}>
      <svg className={fix ? "has-fix" : undefined} viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={`Schematic checkpoint zone, radius ${quest.radius_m} meters${fix ? `; Last check-in was ${formatCheckInDistance(fix.distance)} from the checkpoint. Not a live position` : ""}`}>
        {!fix && <g className="zone-street-blocks" aria-hidden="true"><path d={`M10 12H${size.width * .23}V${size.height * .36}H10Z M10 ${size.height * .49}H${size.width * .23}V${size.height - 12}H10Z M${size.width * .3} 12H${size.width * .48}V${size.height - 12}H${size.width * .3}Z M${size.width * .56} 12H${size.width * .74}V${size.height - 12}H${size.width * .56}Z M${size.width * .81} 12H${size.width - 10}V${size.height - 12}H${size.width * .81}Z`} /></g>}
        <path className="zone-grid" d={`M0 ${g.cy - 50}H${size.width} M0 ${g.cy}H${size.width} M0 ${g.cy + 50}H${size.width} M${size.width * .3} 0V${size.height} M${size.width * .5} 0V${size.height} M${size.width * .7} 0V${size.height}`} />
        <circle className="zone-boundary" cx={g.cx} cy={g.cy} r={g.radius} />
        {fix && (fix.far ? <g className="off-map-fix" aria-label="Last check-in position off map">
          <path className="fix-line broken-fix-line" aria-label="Broken connection to checkpoint zone" d={`M${left} ${g.cy}H${breakX + 12} M${breakX - 12} ${g.cy}H32`} />
          <path className="fix-break" d={`m${breakX - 3} ${g.cy - 8}-5 16 m12-16-5 16`} />
          <path className="off-map-arrow" data-direction="horizontal-left" d={`M42 ${g.cy}H24 m8-7-8 7 8 7`} />
          <text className="off-map-distance" x="12" y={g.cy - 23}>{formatCheckInDistance(fix.distance)}</text>
          <text className="off-map-caption" x="12" y={g.cy + 28}>YOUR FIX · OFF THE MAP</text>
        </g> : <><line className="fix-line" aria-label="Last check-in fix to checkpoint zone" x1={g.x} y1={g.y} x2={g.zoneX} y2={g.zoneY} /><circle className="fix-dot" cx={g.x} cy={g.y} r="5" /><text className="fix-label" x={g.labelX} y={g.labelY} textAnchor="middle"><tspan>YOUR FIX · </tspan><tspan className="fix-distance">{formatCheckInDistance(fix.distance)}</tspan></text></>)}
        <circle className="checkpoint-dot" cx={g.cx} cy={g.cy} r="7" />
        {fix ? <text className="checkpoint-map-label" x={g.cx} y={g.cy - 14} textAnchor="middle">CHECKPOINT</text> : <>
          <g className="idle-map-checkpoint"><rect x="10" y="8" width="94" height="20" /><text x="17" y="22">● CHECKPOINT</text></g>
          <g className="idle-map-north"><rect x={size.width - 38} y="8" width="26" height="20" /><text x={size.width - 25} y="22" textAnchor="middle">N ↑</text></g>
          <line className="idle-radius-line" x1={g.cx + 7} y1={g.cy} x2={g.cx + g.radius - 4} y2={g.cy} />
          <g className="idle-radius-label"><rect x={g.cx + g.radius - 38} y={g.cy - 20} width="37" height="15" /><text x={g.cx + g.radius - 19.5} y={g.cy - 8} textAnchor="middle">{quest.radius_m} M</text></g>
        </>}
        <text className="schematic-caption" x={fix ? size.width / 2 : 10} y={size.height - 8} textAnchor={fix ? "middle" : "start"}>{fix ? !fix.far ? "SCHEMATIC · NORTH ↑" : "SCHEMATIC · NOT TO SCALE · NORTH ↑" : "SCHEMATIC · NOT TO SCALE"}</text>
      </svg>
    </div> : <p className="hint">Checkpoint map is unavailable.</p>}
    {(quest.place_label || fix || maps) && <figcaption><div className="map-footer-main">{quest.place_label && <div className="checkpoint-caption"><span className="eyebrow">CHECKPOINT</span><strong>{quest.place_label}</strong></div>}{maps && <a className="map-link" href={maps} target="_blank" rel="noopener noreferrer">OPEN IN MAPS <ArrowIcon direction="right" /></a>}</div>{fix && <p className="last-fix"><span>LAST CHECK-IN · <span className="last-fix-distance">{formatCheckInDistance(fix.distance).replace(" ", "\u00a0")}</span> FROM CHECKPOINT</span><small>GPS <span className="last-fix-accuracy">±{formatCheckInDistance(fix.accuracy, true).replace(" ", "\u00a0")}</span> · <span className="last-fix-age">{sampleAge}</span> · <span className="last-fix-privacy">NOT A LIVE POSITION</span></small></p>}</figcaption>}
  </figure>;
}
