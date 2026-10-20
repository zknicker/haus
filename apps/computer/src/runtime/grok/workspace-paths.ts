/**
 * Grok reports absolute paths under the Agent workspace. Like the AI SDK harness before it, the
 * driver shows them workspace-relative: `<workspace>/a.txt` becomes `a.txt` and the workspace
 * itself `.`. Only a prefix at a path boundary is replaced, so free-form output stays intact.
 */
export function createWorkspacePaths(workspaceDirs: readonly string[]) {
    const patterns = [...new Set(workspaceDirs.map(trimSlash).filter((dir) => dir.length > 1))]
        .sort((a, b) => b.length - a.length)
        .map(
            (dir) =>
                new RegExp(
                    `(^|[\\s"'\`=(])${escapeRegExp(dir)}(?:/|(?=[\\s"'\`;|&<>(),:]|$))`,
                    'gu'
                )
        );
    const strip = (text: string): string =>
        patterns.reduce(
            (current, pattern) =>
                current.replace(pattern, (match, boundary: string) =>
                    match.endsWith('/') ? boundary : `${boundary}.`
                ),
            text
        );
    const deep = (value: unknown, depth = 0): unknown => {
        if (typeof value === 'string') {
            return strip(value);
        }
        if (depth > 32 || value === null || typeof value !== 'object') {
            return value;
        }
        if (Array.isArray(value)) {
            return value.map((item) => deep(item, depth + 1));
        }
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, deep(item, depth + 1)])
        );
    };
    return {
        /** A path relative to the workspace when it is inside it. */
        relative: (path: string): string => strip(path),
        /** The same value with workspace prefixes stripped from every string. */
        strip: deep,
    };
}

export type WorkspacePaths = ReturnType<typeof createWorkspacePaths>;

function trimSlash(dir: string): string {
    return dir.replace(/\/+$/u, '');
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
