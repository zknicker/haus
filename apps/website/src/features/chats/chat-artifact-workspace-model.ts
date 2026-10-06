import type { WorkspaceFileEntry as ServerWorkspaceFileEntry } from '@haus/api';

export type WorkspaceFileEntry = ServerWorkspaceFileEntry;

/**
 * What we know about one directory's listing. `ready` keeps its entries
 * through a background refetch, so a refresh never blanks a loaded folder.
 */
export type WorkspaceDirectoryListing =
    | { entries: WorkspaceFileEntry[]; status: 'ready' }
    | { status: 'error' }
    | { status: 'loading' };
export type WorkspaceDirectoryListings = Readonly<Record<string, WorkspaceDirectoryListing>>;

/**
 * One row of the workspace browser, in the nested shape HeroUI's FileTree
 * renders. Directories always carry a `children` array; until their listing
 * arrives it is empty, so leaf-ness is decided by `kind`, never by child
 * count. A `notice` is the non-interactive row under an expanded folder that
 * says it is loading, empty, or failed.
 */
export type WorkspaceTreeNode =
    | { children: WorkspaceTreeNode[]; id: string; kind: 'directory'; name: string }
    | { id: string; kind: 'file'; name: string }
    | { id: string; kind: 'notice'; name: string; tone: 'danger' | 'muted' };

type DirectoryNode = Extract<WorkspaceTreeNode, { kind: 'directory' }>;

/**
 * Folds the per-directory listings we know about into one tree. Ancestors are
 * synthesized from the entry paths themselves, so a directory loaded directly
 * (an `initialDirectoryPath` deep in the workspace) still hangs off a spine of
 * folders instead of appearing at the root. Top-level entries render at depth 0.
 */
export function buildWorkspaceTree(listings: WorkspaceDirectoryListings): WorkspaceTreeNode[] {
    const roots: WorkspaceTreeNode[] = [];
    const nodesByPath = new Map<string, WorkspaceTreeNode>();

    const ensureDirectory = (path: string): DirectoryNode | null => {
        if (!path) {
            return null;
        }
        const existing = nodesByPath.get(path);
        if (existing?.kind === 'directory') {
            return existing;
        }
        const segments = path.split('/');
        const parent = ensureDirectory(segments.slice(0, -1).join('/'));
        const node: DirectoryNode = {
            children: [],
            id: path,
            kind: 'directory',
            name: segments.at(-1) ?? path,
        };
        nodesByPath.set(path, node);
        (parent?.children ?? roots).push(node);
        return node;
    };

    for (const [directoryPath, listing] of Object.entries(listings)) {
        const directory = ensureDirectory(normalizeWorkspacePath(directoryPath));
        if (listing.status !== 'ready') {
            directory?.children.push(listingNotice(directory.id, listing.status));
            continue;
        }
        if (directory && listing.entries.length === 0) {
            directory.children.push(listingNotice(directory.id, 'empty'));
        }
        for (const entry of listing.entries) {
            const path = normalizeWorkspacePath(entry.path);
            if (!path || nodesByPath.has(path)) {
                continue;
            }
            if (entry.kind === 'directory') {
                ensureDirectory(path);
                continue;
            }
            const segments = path.split('/');
            const parent = ensureDirectory(segments.slice(0, -1).join('/'));
            const node: WorkspaceTreeNode = {
                id: path,
                kind: 'file',
                name: entry.name || (segments.at(-1) ?? path),
            };
            nodesByPath.set(path, node);
            (parent?.children ?? roots).push(node);
        }
    }

    sortWorkspaceNodes(roots);
    return roots;
}

/**
 * Prunes the tree to entries whose own name matches the query, keeping the
 * folders above each match. A matching folder keeps only matching descendants
 * — matching on the name rather than the path is what stops one folder-name
 * hit from keeping everything beneath it. Notices never survive a query.
 */
export function filterWorkspaceTree(nodes: WorkspaceTreeNode[], query: string) {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery ? pruneWorkspaceNodes(nodes, normalizedQuery) : nodes;
}

/** Every directory in the tree that has rows to reveal. */
export function workspaceExpandableKeys(nodes: WorkspaceTreeNode[]): string[] {
    return nodes.flatMap((node) =>
        node.kind === 'directory' && node.children.length > 0
            ? [node.id, ...workspaceExpandableKeys(node.children)]
            : []
    );
}

/**
 * False only when the listing of a folder above `path` is in hand and lacks
 * it — the folder was deleted or renamed. Unknown stays true.
 */
export function workspaceDirectoryExists(path: string, listings: WorkspaceDirectoryListings) {
    let child = normalizeWorkspacePath(path);
    while (child) {
        const parent = child.split('/').slice(0, -1).join('/');
        const listing = listings[parent];
        if (
            listing?.status === 'ready' &&
            !listing.entries.some(
                (entry) =>
                    entry.kind === 'directory' && normalizeWorkspacePath(entry.path) === child
            )
        ) {
            return false;
        }
        child = parent;
    }
    return true;
}

/** Every folder above `path`, outermost first, excluding `path` itself. */
export function workspaceAncestorPaths(path: string) {
    const segments = normalizeWorkspacePath(path).split('/').filter(Boolean);
    return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
}

export function isWorkspaceLeafNode(node: WorkspaceTreeNode) {
    return node.kind !== 'directory';
}

export function normalizeWorkspacePath(path: string) {
    return path.trim().replace(/\\/gu, '/').replace(/^\/+/u, '').replace(/\/+$/u, '');
}

const noticeNames = {
    empty: 'Empty folder',
    error: 'Couldn’t load this folder',
    loading: 'Loading…',
} as const;

function listingNotice(directoryPath: string, state: keyof typeof noticeNames): WorkspaceTreeNode {
    // Real ids are normalized paths, which never contain a NUL, so a notice
    // id cannot collide with a workspace entry.
    return {
        id: `\u0000${state}:${directoryPath}`,
        kind: 'notice',
        name: noticeNames[state],
        tone: state === 'error' ? 'danger' : 'muted',
    };
}

function pruneWorkspaceNodes(nodes: WorkspaceTreeNode[], query: string): WorkspaceTreeNode[] {
    const matched: WorkspaceTreeNode[] = [];
    for (const node of nodes) {
        if (node.kind === 'notice') {
            continue;
        }
        const isMatch = node.name.toLowerCase().includes(query);
        if (node.kind === 'file') {
            if (isMatch) {
                matched.push(node);
            }
            continue;
        }
        const children = pruneWorkspaceNodes(node.children, query);
        if (isMatch || children.length > 0) {
            matched.push({ ...node, children });
        }
    }
    return matched;
}

function sortWorkspaceNodes(nodes: WorkspaceTreeNode[]) {
    nodes.sort(compareWorkspaceNodes);
    for (const node of nodes) {
        if (node.kind === 'directory') {
            sortWorkspaceNodes(node.children);
        }
    }
}

const kindOrder = { directory: 1, file: 2, notice: 0 } as const;

function compareWorkspaceNodes(left: WorkspaceTreeNode, right: WorkspaceTreeNode) {
    if (left.kind !== right.kind) {
        return kindOrder[left.kind] - kindOrder[right.kind];
    }
    return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: 'base',
    });
}
