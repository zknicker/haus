import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import {
    createWorkspaceExpansion,
    pruneMissingDirectories,
    revealWorkspacePath,
    setWorkspaceExpanded,
    toggled,
    toggleWorkspaceDirectory,
    workspaceExpansionScope,
} from './chat-artifact-workspace-expansion.ts';
import {
    buildWorkspaceTree,
    filterWorkspaceTree,
    type WorkspaceDirectoryListing,
    type WorkspaceTreeNode,
    workspaceExpandableKeys,
} from './chat-artifact-workspace-model.ts';

export type WorkspaceTreeStatus = 'error' | 'loading' | 'ready';

export interface WorkspaceTreeState {
    expandedKeys: ReadonlySet<string>;
    hasQuery: boolean;
    nodes: WorkspaceTreeNode[];
    onExpandedChange: (keys: ReadonlySet<string>) => void;
    onQueryChange: (query: string) => void;
    onToggleDirectory: (path: string) => void;
    query: string;
    status: WorkspaceTreeStatus;
}

/**
 * The workspace rail's tree: one live `workspaceFiles` query per folder the
 * reader has opened, folded into one tree, plus the reader's expansion and
 * search. Every listing is its own query keyed by Agent, Server, path, and
 * hidden-files choice, so a realtime invalidation refreshes open folders in
 * place and a late response can never land in another Agent's tree.
 */
export function useWorkspaceTreeState({
    agentId,
    includeHidden,
    initialDirectoryPath,
    selectedPath,
    serverId,
}: {
    agentId: string;
    includeHidden: boolean;
    initialDirectoryPath: string;
    selectedPath: null | string;
    serverId: string;
}): WorkspaceTreeState {
    const scope = workspaceExpansionScope({ agentId, includeHidden, serverId });
    const [stored, setStored] = React.useState(() =>
        createWorkspaceExpansion({ initialDirectoryPath, scope, selectedPath })
    );
    const current =
        stored.scope === scope
            ? revealWorkspacePath(stored, selectedPath)
            : createWorkspaceExpansion({ initialDirectoryPath, scope, selectedPath });

    const options = { ...queryPolicy.computerSnapshot, enabled: agentId.length > 0 };
    const rootQuery = hausTrpc.agent.workspaceFiles.useQuery(
        { agentId, includeHidden, path: '', serverId },
        options
    );
    const listedPaths = [...current.listed];
    const directoryQueries = hausTrpc.useQueries((t) =>
        listedPaths.map((path) =>
            t.agent.workspaceFiles({ agentId, includeHidden, path, serverId }, options)
        )
    );

    const listings: Record<string, WorkspaceDirectoryListing> = {};
    if (rootQuery.data) {
        listings[''] = { entries: rootQuery.data.entries, status: 'ready' };
    }
    listedPaths.forEach((path, index) => {
        const query = directoryQueries[index];
        listings[path] = query?.data
            ? { entries: query.data.entries, status: 'ready' }
            : query?.error
              ? { status: 'error' }
              : { status: 'loading' };
    });

    // Scope changes, selection reveals, and vanished folders all settle here,
    // during render, so no frame shows another scope's expansion.
    const expansion = pruneMissingDirectories(current, listings);
    if (expansion !== stored) {
        setStored(expansion);
    }

    const [search, setSearch] = React.useState<{
        collapsed: ReadonlySet<string>;
        query: string;
    }>(emptySearch);
    const hasQuery = search.query.trim().length > 0;
    const nodes = filterWorkspaceTree(buildWorkspaceTree(listings), search.query);
    // A query opens every branch it left standing, without loading anything
    // or touching the reader's own expansion, which returns when it clears.
    const expandedKeys = hasQuery
        ? new Set(workspaceExpandableKeys(nodes).filter((key) => !search.collapsed.has(key)))
        : expansion.expanded;

    return {
        expandedKeys,
        hasQuery,
        nodes,
        onExpandedChange: (keys) => {
            if (hasQuery) {
                const collapsed = workspaceExpandableKeys(nodes).filter((key) => !keys.has(key));
                setSearch({ collapsed: new Set(collapsed), query: search.query });
                return;
            }
            setStored(setWorkspaceExpanded(expansion, keys));
        },
        onQueryChange: (query) => setSearch({ collapsed: new Set(), query }),
        onToggleDirectory: (path) => {
            if (hasQuery) {
                setSearch({ collapsed: toggled(search.collapsed, path), query: search.query });
                return;
            }
            setStored(toggleWorkspaceDirectory(expansion, path));
        },
        query: search.query,
        status: rootQuery.isPending
            ? 'loading'
            : rootQuery.error && !rootQuery.data
              ? 'error'
              : 'ready',
    };
}

const emptySearch = { collapsed: new Set<string>(), query: '' };
