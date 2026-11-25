export interface Prefs {
  includeClosed: boolean;
  nextOnly: boolean;
}

const KEY = "spokes-view.prefs";

/** Saved view preferences; any storage or parse failure yields the defaults. */
export function loadPrefs(): Prefs {
  const prefs: Prefs = { includeClosed: false, nextOnly: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return prefs;
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      prefs.includeClosed = o.includeClosed === true;
      prefs.nextOnly = o.nextOnly === true;
    }
  } catch {
    // Storage unavailable or corrupt: fall back to the defaults.
  }
  return prefs;
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable or full: the preference just does not persist.
  }
}
