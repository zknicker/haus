import { relativizeWorkspacePath } from '@haus/api';

/**
 * Filename-first path display: a row names the file, and the directory follows
 * muted. An absolute path inside an Agent workspace loses everything up to the
 * workspace (and one in the Agent's home reads `~/…`), so a host's username,
 * Server id, and Agent id never lead a row.
 */
export interface TracePath {
    /** The directory, workspace-relative when it can be: `projects/tinylink/src`; empty at the root. */
    readonly dir: string;
    /** The basename: `shorten.ts`. */
    readonly name: string;
    /** The full display path, workspace-relative when it can be. */
    readonly path: string;
}

export function readTracePath(raw: string): TracePath {
    const path = relativizeWorkspacePath(raw.trim());
    const trimmed = path.replace(/\/+$/u, '');
    const slash = trimmed.lastIndexOf('/');
    if (slash === -1) {
        return { dir: '', name: trimmed, path };
    }
    return { dir: trimmed.slice(0, slash) || '/', name: trimmed.slice(slash + 1), path };
}

export function basenameOf(path: string): string {
    return readTracePath(path).name;
}
