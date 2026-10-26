// Public deployment configuration, shared by Vite's build and the browser client.
export function apiBase(value: string | undefined, production: boolean): string {
  const raw = value?.trim() ?? "";
  if (!production) return raw.replace(/\/$/, "");
  const invalid = () => new Error("Production VITE_API_BASE_URL must be a public HTTPS origin without credentials, path, query or fragment.");
  if (!raw || /\s/.test(raw)) throw invalid();
  let url: URL;
  try { url = new URL(raw); } catch { throw invalid(); }
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password
    || url.pathname !== "/" || url.search || url.hash
    || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".railway.internal")
    || host === "::1" || host === "::" || /^127\./.test(host) || host === "0.0.0.0") throw invalid();
  return url.origin;
}
