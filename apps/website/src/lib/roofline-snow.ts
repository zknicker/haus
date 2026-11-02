/**
 * The snow the Christmas themes' roofline wears (`scene: 'snowy-roofline'`),
 * picked in Settings > Preferences > Appearance > Snow. App-local
 * presentation: persisted per device, never synced, and only read while a
 * theme with a roofline is on.
 */
const rooflineSnowIds = ['puffy', 'soft', 'icicles'] as const;

export type RooflineSnow = (typeof rooflineSnowIds)[number];

export const defaultRooflineSnow: RooflineSnow = 'puffy';

export const rooflineSnowStorageKey = 'haus.roofline-snow';

/** Picker order for Settings and Cmd+K. */
export const rooflineSnows: readonly { readonly id: RooflineSnow; readonly label: string }[] = [
    { id: 'puffy', label: 'Puffy' },
    { id: 'soft', label: 'Soft' },
    { id: 'icicles', label: 'Icicles' },
];

export function parseRooflineSnow(value: unknown): RooflineSnow | null {
    return rooflineSnowIds.find((id) => id === value) ?? null;
}

/** The persisted snow. Missing, unknown, or unreadable values all read as the default. */
export function readStoredRooflineSnow(storage: Pick<Storage, 'getItem'> | null): RooflineSnow {
    try {
        return parseRooflineSnow(storage?.getItem(rooflineSnowStorageKey)) ?? defaultRooflineSnow;
    } catch {
        return defaultRooflineSnow;
    }
}

/** Persists the snow; a blocked storage keeps the in-memory choice for this session. */
export function writeStoredRooflineSnow(
    storage: Pick<Storage, 'setItem'> | null,
    snow: RooflineSnow
) {
    try {
        storage?.setItem(rooflineSnowStorageKey, snow);
    } catch {
        // Presentation preference only; the live choice still applies.
    }
}
