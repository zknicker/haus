import {
    normalizeWorkspacePath,
    type WorkspaceDirectoryListings,
    workspaceAncestorPaths,
    workspaceDirectoryExists,
} from './chat-artifact-workspace-model.ts';

/**
 * The reader's own expansion of one workspace browse: which folders are open,
 * and which folders' listings stay live. `listed` only grows within a scope,
 * so a collapsed folder keeps its children for search and refreshes quietly
 * with the rest. A new scope (another Agent, Server, or hidden-files choice)
 * starts over; a refetch of the same scope never does.
 */
export interface WorkspaceExpansion {
    expanded: ReadonlySet<string>;
    listed: ReadonlySet<string>;
    /** The selected file whose ancestors were last opened, so each selection reveals once. */
    revealedPath: null | string;
    scope: string;
}

export function workspaceExpansionScope(input: {
    agentId: string;
    includeHidden: boolean;
    serverId: string;
}) {
    return JSON.stringify([input.serverId, input.agentId, input.includeHidden]);
}

export function createWorkspaceExpansion({
    initialDirectoryPath,
    scope,
    selectedPath,
}: {
    initialDirectoryPath: string;
    scope: string;
    selectedPath: null | string;
}): WorkspaceExpansion {
    const initialDirectory = normalizeWorkspacePath(initialDirectoryPath);
    const paths = initialDirectory
        ? [...workspaceAncestorPaths(initialDirectory), initialDirectory]
        : [];
    const fresh: WorkspaceExpansion = {
        expanded: new Set(paths),
        listed: new Set(paths),
        revealedPath: null,
        scope,
    };
    return revealWorkspacePath(fresh, selectedPath);
}

/** Opens every folder above a newly selected file, once per selection. */
export function revealWorkspacePath(
    state: WorkspaceExpansion,
    selectedPath: null | string
): WorkspaceExpansion {
    if (state.revealedPath === selectedPath) {
        return state;
    }
    const ancestors = selectedPath ? workspaceAncestorPaths(selectedPath) : [];
    return {
        ...state,
        expanded: withPaths(state.expanded, ancestors),
        listed: withPaths(state.listed, ancestors),
        revealedPath: selectedPath,
    };
}

export function setWorkspaceExpanded(
    state: WorkspaceExpansion,
    expanded: ReadonlySet<string>
): WorkspaceExpansion {
    return { ...state, expanded, listed: withPaths(state.listed, [...expanded]) };
}

export function toggleWorkspaceDirectory(
    state: WorkspaceExpansion,
    path: string
): WorkspaceExpansion {
    return setWorkspaceExpanded(state, toggled(state.expanded, path));
}

/**
 * Drops folders a fresh parent listing no longer contains, so a deleted
 * folder neither stays open nor keeps refetching. Returns `state` unchanged
 * when nothing went missing.
 */
export function pruneMissingDirectories(
    state: WorkspaceExpansion,
    listings: WorkspaceDirectoryListings
): WorkspaceExpansion {
    const missing = [...state.listed].filter((path) => !workspaceDirectoryExists(path, listings));
    if (missing.length === 0) {
        return state;
    }
    const keep = (path: string) => !missing.includes(path);
    return {
        ...state,
        expanded: new Set([...state.expanded].filter(keep)),
        listed: new Set([...state.listed].filter(keep)),
    };
}

export function toggled(set: ReadonlySet<string>, path: string): ReadonlySet<string> {
    const next = new Set(set);
    if (!next.delete(path)) {
        next.add(path);
    }
    return next;
}

function withPaths(current: ReadonlySet<string>, paths: string[]) {
    return paths.every((path) => current.has(path)) ? current : new Set([...current, ...paths]);
}
