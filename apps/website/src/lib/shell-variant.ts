/**
 * The desktop window layout (docs/features/desktop-window-layout.md): `band`
 * (the default) or `canvas`, picked in Settings > Preferences. The web has no
 * window layout. App-local presentation: persisted per device, never synced.
 */
export type ShellVariant = 'band' | 'canvas';

export const defaultShellVariant: ShellVariant = 'band';

export const shellVariantStorageKey = 'haus.shell.variant';

export function parseShellVariant(value: unknown): ShellVariant | null {
    return value === 'band' || value === 'canvas' ? value : null;
}

/**
 * The persisted layout. Missing, retired (the old `current` classic shell),
 * unknown, or unreadable values all read as the default.
 */
export function readStoredShellVariant(storage: Pick<Storage, 'getItem'> | null): ShellVariant {
    try {
        return parseShellVariant(storage?.getItem(shellVariantStorageKey)) ?? defaultShellVariant;
    } catch {
        return defaultShellVariant;
    }
}

/** Persists the layout; a blocked storage keeps the in-memory choice for this session. */
export function writeStoredShellVariant(
    storage: Pick<Storage, 'setItem'> | null,
    variant: ShellVariant
) {
    try {
        storage?.setItem(shellVariantStorageKey, variant);
    } catch {
        // Presentation preference only; the live choice still applies.
    }
}
