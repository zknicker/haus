import { artifactPathKey } from '@haus/api';

/**
 * The item the library last handed off from, per folder: the file a viewer
 * opened (and stepped to) or the item Show in folder points at. A library
 * opening that folder starts with it selected and focused, so Back from a
 * viewer lands where you left, as in Finder. Window-local presentation state;
 * the next hand-off from the same folder replaces it.
 */
const handoffs = new Map<string, string>();

export function rememberLibraryItem(folder: string, key: string) {
    handoffs.set(artifactPathKey(folder), key);
}

export function lastLibraryItem(folder: string): string | null {
    return handoffs.get(artifactPathKey(folder)) ?? null;
}
