/** Resolve API base: Vite proxy (same origin) first, then direct port 4000 fallbacks. */
const CANDIDATES = [
  import.meta.env.VITE_API_URL,
  "",
  "http://127.0.0.1:4000",
  "http://localhost:4000"
].filter((v, i, arr) => v !== undefined && arr.indexOf(v) === i);

let preferredBase = null;

export function getApiBase() {
  return preferredBase ?? CANDIDATES[0] ?? "";
}

export async function apiFetch(path, options = {}) {
  const ordered = preferredBase
    ? [preferredBase, ...CANDIDATES.filter((b) => b !== preferredBase)]
    : CANDIDATES;

  let lastError = null;
  for (const base of ordered) {
    const url = `${base}${path}`;
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status === 404 || res.status === 400) {
        preferredBase = base;
        return res;
      }
      lastError = new Error(`${res.status} ${res.statusText} from ${url}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("API unavailable — start the server with npm run dev");
}

export async function checkApiHealth() {
  try {
    const res = await apiFetch("/api/health");
    return res.ok;
  } catch {
    return false;
  }
}
