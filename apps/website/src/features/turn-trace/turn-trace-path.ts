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

/**
 * Computer journals sub-agent paths as absolute host paths today; the top-level
 * Agent's are already relative (the harness patch). This strip is the App-side
 * fallback and can go once Computer relativizes every journalled path.
 */
const workspacePrefix = /^\/(?:[^/]+\/)*agents\/[^/]+\/workspace(?:\/|$)/u;
/** The Agent's own home (runtime skills, generated files) reads as `~`. */
const homePrefix = /^\/(?:[^/]+\/)*agents\/[^/]+\/home(?=\/|$)/u;

export function readTracePath(raw: string): TracePath {
    const path = relativizeWorkspacePath(raw.trim());
    const trimmed = path.replace(/\/+$/u, '');
    const slash = trimmed.lastIndexOf('/');
    if (slash === -1) {
        return { dir: '', name: trimmed, path };
    }
    return { dir: trimmed.slice(0, slash) || '/', name: trimmed.slice(slash + 1), path };
}

export function relativizeWorkspacePath(path: string): string {
    const relative = path.replace(workspacePrefix, '');
    if (relative !== path) {
        return relative || '<workspace>';
    }
    return path.replace(homePrefix, '~');
}

export function basenameOf(path: string): string {
    return readTracePath(path).name;
}
