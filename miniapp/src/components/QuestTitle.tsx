import { useLayoutEffect, useRef, useState } from "react";

// Measure the loaded display font so the sticker follows the final visual line.
export function QuestTitle({ title, compact = false }: { title: string; compact?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [layout, setLayout] = useState({ size: compact ? 52 : 72, lines: [title] });
  useLayoutEffect(() => {
    const node = heading.current;
    if (!node) return;
    let active = true;
    function measure() {
      if (!active || !node) return;
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return;
      const style = getComputedStyle(node);
      const available = Math.max(1, node.clientWidth - 22); // Sticker padding + rotated corners.
      const words = title.trim().split(/\s+/);
      const font = (size: number) => { ctx.font = `800 ${size}px ${style.fontFamily}`; };
      font(72);
      const longest = Math.max(...words.map(word => ctx.measureText(word.toUpperCase()).width), 1);
      const baseSize = Math.max(48, Math.min(72, Math.floor(72 * available / longest)));
      let size = compact ? Math.max(48, Math.floor(baseSize * 52 / 72)) : baseSize;
      // Keep the existing poster line breaks and final sticker while reducing size.
      font(baseSize);
      // Extremely long unbroken names still fit at the minimum readable size.
      const pieces = words.flatMap(word => {
        const chunks: string[] = []; let chunk = "";
        for (const character of word) {
          if (chunk && ctx.measureText((chunk + character).toUpperCase()).width > available) { chunks.push(chunk); chunk = ""; }
          chunk += character;
        }
        return [...chunks, chunk];
      });
      const lines: string[] = []; let line = "";
      for (const word of pieces) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate.toUpperCase()).width > available) { lines.push(line); line = word; }
        else line = candidate;
      }
      if (line) lines.push(line);
      if ((lines[0]?.length ?? 0) > 9) size = Math.min(size, 56);
      setLayout(previous => previous.size === size && previous.lines.join("\n") === lines.join("\n") ? previous : { size, lines });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    void document.fonts.ready.then(measure);
    return () => { active = false; observer.disconnect(); };
  }, [title, compact]);
  return <h1 ref={heading} className="quest-poster-title" title={title} aria-label={title} style={{ fontSize: layout.size }}>
    {layout.lines.map((line, index) => <span className={`quest-title-line${index === layout.lines.length - 1 ? " quest-title-sticker" : ""}`} key={index}>{line}</span>)}
  </h1>;
}
