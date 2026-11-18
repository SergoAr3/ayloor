import { exploreApi, type Guide, type Run } from "./api";

export type Saved = { startKey: string } | { runId: string; credential: string };
const prefix = "ayloor-explore:v1:guide:";
export const lastGuideKey = "ayloor-explore:v1:last-guide";
// Compatibility boundary only; the normal flow has no default/demo guide.
export const legacyStorageKey = "ayloor-explore-demo-v1";
const legacySlug = "explore-demo-v1";
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const validSlug = (slug: string) => slug.length <= 100 && slugPattern.test(slug);

export function entryGuide(search: string): string | null {
  const values = new URLSearchParams(search).getAll("guide");
  if (!values.length) return null;
  if (values.length !== 1 || !validSlug(values[0])) throw new Error("Invalid walk link. Open the original link for your walk.");
  return values[0];
}

export function storageKey(slug: string): string {
  if (!validSlug(slug)) throw new Error("Invalid walk identifier.");
  return `${prefix}${slug}`;
}
export const entryUrl = (slug: string) => `/explore.html?guide=${encodeURIComponent(slug)}`;

function parseSaved(raw: string | null): Saved | null {
  if (raw === null) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (data && typeof data === "object") {
      if ("startKey" in data && typeof data.startKey === "string" && /^[a-f0-9]{64}$/.test(data.startKey))
        return { startKey: data.startKey };
      if ("runId" in data && typeof data.runId === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(data.runId)
        && "credential" in data && typeof data.credential === "string" && /^[a-f0-9]{64}$/.test(data.credential))
        return { runId: data.runId, credential: data.credential };
    }
  } catch { /* Preserve the record; never silently replace saved access. */ }
  throw new Error("Saved walk access is unreadable. No new run was started.");
}

export function loadSaved(slug: string): Saved | null {
  return parseSaved(localStorage.getItem(storageKey(slug)));
}

export function save(slug: string, value: Saved): void {
  // Save credentials/retry key before the optional navigation pointer. If storage
  // fails, the caller stops; the explicit version URL still allows recovery.
  localStorage.setItem(storageKey(slug), JSON.stringify(value));
  localStorage.setItem(lastGuideKey, slug);
}

export function remember(slug: string): void {
  storageKey(slug); // Validate before recording a navigation pointer.
  localStorage.setItem(lastGuideKey, slug);
}

function lastGuide(): string | null {
  const slug = localStorage.getItem(lastGuideKey);
  return slug && validSlug(slug) ? slug : null;
}

export function previousWalkLink(entry: string | null): string | null {
  const last = lastGuide();
  if (last) return entry && last !== entry ? entryUrl(last) : null;
  return entry && entry !== legacySlug && localStorage.getItem(legacyStorageKey) !== null ? "/explore.html" : null;
}

function verifyRun(run: Run, saved: Saved, slug: string): void {
  if (!("runId" in saved) || run.id !== saved.runId || run.guide.slug !== slug)
    throw new Error("Saved walk does not match this link. No progress was changed.");
}

export async function restoreWalk(entry: string | null): Promise<{
  slug: string; guide: Guide; saved: Saved | null; run: Run | null; migrate: boolean;
}> {
  let slug = entry ?? lastGuide();
  let saved = slug ? loadSaved(slug) : null;
  let migrate = false;
  // Only an explicit old-demo link or a bare Resume entry may import old storage.
  // A link to another version can never consume its bootstrap key or credential.
  if (!saved && (!entry || entry === legacySlug)) {
    const legacy = parseSaved(localStorage.getItem(legacyStorageKey));
    if (legacy) {
      if ("credential" in legacy) {
        const legacyRun = await exploreApi<Run>(`/runs/${legacy.runId}`, legacy.credential);
        const original = legacyRun.guide.slug;
        if (entry && original !== entry) throw new Error("Saved walk does not match this link. Open /explore.html to resume it.");
        slug = original;
        verifyRun(legacyRun, legacy, slug);
      } else {
        slug = legacySlug; // Old pending starts were created only for this version.
      }
      // Never overwrite a newer scoped record, and keep the legacy key for recovery.
      saved = loadSaved(slug);
      migrate = saved === null;
      saved ??= legacy;
    }
  }
  if (!slug) throw new Error("No walk selected. Open a link to a published walk.");
  if (saved && "credential" in saved) {
    const run = await exploreApi<Run>(`/runs/${saved.runId}`, saved.credential);
    verifyRun(run, saved, slug);
    return { slug, guide: run.guide, saved, run, migrate };
  }
  const guide = await exploreApi<Guide>(`/guides/${slug}`);
  if (guide.slug !== slug) throw new Error("This walk is unavailable. Check the original link.");
  return { slug, guide, saved, run: null, migrate };
}
