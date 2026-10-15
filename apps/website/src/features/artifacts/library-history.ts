/** Which way the Files view can step through its own history. */
export interface LibraryHistorySteps {
    back: boolean;
    forward: boolean;
}

export const noLibraryHistory: LibraryHistorySteps = { back: false, forward: false };

/**
 * Back and Forward walk only the Files view's own history (Finder's folder
 * history): the entry beside the current one must be the library itself, at
 * any folder or filter. A chat before it, or a file's viewer after it, ends
 * the Files history even though the router could still step there.
 *
 * `paths` are router paths (`/s/<slug>/artifacts?folder=…`), null where an
 * entry is not an App page; `libraryPath` is the Server's `/s/<slug>/artifacts`.
 */
export function libraryHistorySteps(
    paths: readonly (string | null)[],
    index: number,
    libraryPath: string
): LibraryHistorySteps {
    const isLibrary = (path: string | null | undefined) =>
        typeof path === 'string' && isLibraryPath(path, libraryPath);
    return {
        back: isLibrary(paths[index - 1]),
        forward: isLibrary(paths[index + 1]),
    };
}

/** The library page itself, whatever its search: not a file's viewer under it. */
export function isLibraryPath(path: string, libraryPath: string): boolean {
    const pathname = path.split(/[?#]/u)[0] ?? '';
    return pathname.replace(/\/+$/u, '') === libraryPath;
}

/** A router path from a history entry's full URL: the hash route on desktop, else the path. */
export function routerPathFromUrl(url: string | null): string | null {
    if (!url) {
        return null;
    }
    try {
        const parsed = new URL(url);
        return parsed.hash.startsWith('#/')
            ? parsed.hash.slice(1)
            : `${parsed.pathname}${parsed.search}`;
    } catch {
        return null;
    }
}
