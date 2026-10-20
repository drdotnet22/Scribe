// App-wide settings (shared by the server and the web app).

/** Filled into the door order form of every new job. Each can still be changed per job. */
export interface DoorDefaults {
  contactName: string; address: string; cityStateZip: string; phone: string; email: string;
  species: string; doorStyle: string; insideEdge: string; panelProfile: string; outsideEdge: string; drawerStyle: string;
  euroHinges: boolean;
}

export interface AppSettings {
  /** Drawers wider than this many inches get the 3/8" bottom box ticked. */
  bottom38OverWidth: number;
  doorDefaults: DoorDefaults;
}

export const DEFAULT_DOOR_DEFAULTS: DoorDefaults = {
  contactName: "", address: "", cityStateZip: "", phone: "", email: "",
  species: "", doorStyle: "", insideEdge: "", panelProfile: "", outsideEdge: "", drawerStyle: "5 piece",
  euroHinges: true,
};

export const DEFAULT_SETTINGS: AppSettings = { bottom38OverWidth: 20, doorDefaults: DEFAULT_DOOR_DEFAULTS };

/** Accept anything stored or sent and return valid settings. */
export function cleanSettings(raw: unknown): AppSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const n = Number(r.bottom38OverWidth);
  const dd = (r.doorDefaults ?? {}) as Record<string, unknown>;
  const text = (k: keyof DoorDefaults): string => {
    const v = dd[k];
    return typeof v === "string" ? v.slice(0, 200) : String(DEFAULT_DOOR_DEFAULTS[k]);
  };
  return {
    bottom38OverWidth: Number.isFinite(n) && n > 0 && n < 200 ? n : DEFAULT_SETTINGS.bottom38OverWidth,
    doorDefaults: {
      contactName: text("contactName"), address: text("address"), cityStateZip: text("cityStateZip"), phone: text("phone"), email: text("email"),
      species: text("species"), doorStyle: text("doorStyle"), insideEdge: text("insideEdge"), panelProfile: text("panelProfile"),
      outsideEdge: text("outsideEdge"), drawerStyle: text("drawerStyle"),
      euroHinges: typeof dd.euroHinges === "boolean" ? dd.euroHinges : DEFAULT_DOOR_DEFAULTS.euroHinges,
    },
  };
}
