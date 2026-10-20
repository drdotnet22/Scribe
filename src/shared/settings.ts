// App-wide settings (shared by the server and the web app).

export interface AppSettings {
  /** Drawers wider than this many inches get the 3/8" bottom box ticked. */
  bottom38OverWidth: number;
}

export const DEFAULT_SETTINGS: AppSettings = { bottom38OverWidth: 20 };

/** Accept anything stored or sent and return valid settings. */
export function cleanSettings(raw: unknown): AppSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const n = Number(r.bottom38OverWidth);
  return { bottom38OverWidth: Number.isFinite(n) && n > 0 && n < 200 ? n : DEFAULT_SETTINGS.bottom38OverWidth };
}
