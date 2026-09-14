import * as React from 'react';
import { useResizablePaneWidth } from '../../components/ui/resizable-pane-rail.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { WorkspaceBrowserRail } from './chat-artifact-workspace-browser-rail.tsx';
import {
    useWorkspaceArtifact,
    WorkspaceArtifactControls,
    WorkspaceArtifactInlineControls,
} from './chat-artifact-workspace-file.tsx';
import {
    WorkspaceBrowserFrame,
    WorkspaceBrowserPreview,
} from './chat-artifact-workspace-layout.tsx';
import {
    buildWorkspaceTree,
    filterWorkspaceTree,
    initialWorkspaceExpansion,
    normalizeWorkspacePath,
    type WorkspaceDirectoryEntries,
    withWorkspacePaths,
    workspaceAncestorPaths,
    workspaceRootTreePath,
} from './chat-artifact-workspace-model.ts';
import { WorkspaceArtifactEmpty } from './chat-artifact-workspace-preview.tsx';
import { WorkspacePageToolbar } from './chat-artifact-workspace-toolbar.tsx';

// HeroUI Sidebar scopes its 240px width internally; repeat it here so the two
// navigation columns align without sharing a surface.
const sidebarRailWidth = 240;

export function WorkspaceBrowserContent({
    agentId,
    initialDirectoryPath = '',
    railVariant = 'panel',
    sidebarStorageKey = 'haus.artifactPane.workspaceSidebar.width',
    selectedPath: controlledSelectedPath,
    onSelectPath,
    serverId,
    treeSide = 'end',
}: {
    agentId: string;
    initialDirectoryPath?: string;
    /** `sidebar` renders the rail as fixed-width page navigation with no drag
        handle. Both variants stay flush with the content ground. */
    railVariant?: 'panel' | 'sidebar';
    sidebarStorageKey?: string;
    /** Controlled open file — when provided, the host owns it (e.g. via the URL) so it
        survives the tab moving to another window. Omitted callers keep local state. */
    selectedPath?: null | string;
    onSelectPath?: (path: null | string) => void;
    serverId: string;
    /** Which edge the file rail sits on. The Artifact Panel keeps it trailing,
        beside the chat it belongs to; a page reads it as navigation and leads. */
    treeSide?: 'end' | 'start';
}) {
    const [internalSelectedPath, setInternalSelectedPath] = React.useState<string | null>(null);
    const selectedPath = onSelectPath ? (controlledSelectedPath ?? null) : internalSelectedPath;
    const setSelectedPath = React.useCallback(
        (path: null | string) => {
            if (onSelectPath) {
                onSelectPath(path);
            } else {
                setInternalSelectedPath(path);
            }
        },
        [onSelectPath]
    );
    const [query, setQuery] = React.useState('');
    const [includeHidden, setIncludeHidden] = React.useState(false);
    const selectedTarget = selectedPath
        ? ({ kind: 'workspaceFile', path: selectedPath } as const)
        : null;
    const artifact = useWorkspaceArtifact({
        agentId,
        includeHidden,
        serverId,
        target: selectedTarget,
    });
    const [expandedPaths, setExpandedPaths] =
        React.useState<ReadonlySet<string>>(initialWorkspaceExpansion);
    const [loadedEntriesByDirectory, setLoadedEntriesByDirectory] =
        React.useState<WorkspaceDirectoryEntries>({});
    const [directoryLoadError, setDirectoryLoadError] = React.useState<string | null>(null);
    const initialDirectory = normalizeWorkspacePath(initialDirectoryPath);
    const serverUtils = hausTrpc.useUtils();
    const fileSidebarWidth = useResizablePaneWidth({
        defaultWidth: 300,
        maxWidth: 440,
        minWidth: 220,
        storageKey: sidebarStorageKey,
    });
    const filesQuery = hausTrpc.agent.workspaceFiles.useQuery(
        { agentId, includeHidden, path: '', serverId },
        { ...queryPolicy.computerSnapshot, enabled: agentId.length > 0 }
    );
    const entriesByDirectory = React.useMemo(
        () => ({
            ...loadedEntriesByDirectory,
            '': filesQuery.data?.entries ?? [],
        }),
        [filesQuery.data?.entries, loadedEntriesByDirectory]
    );
    const visibleNodes = React.useMemo(
        () => filterWorkspaceTree(buildWorkspaceTree(entriesByDirectory), query),
        [entriesByDirectory, query]
    );

    const setSelectedPathRef = React.useRef(setSelectedPath);
    setSelectedPathRef.current = setSelectedPath;
    const previousAgentRef = React.useRef(agentId);
    const previousRootRefreshRef = React.useRef(filesQuery.dataUpdatedAt);
    React.useEffect(() => {
        setLoadedEntriesByDirectory({});
        setExpandedPaths(initialWorkspaceExpansion);
        setDirectoryLoadError(agentId ? null : 'No active agent workspace is available.');

        // Clear the open file only when the agent actually changes, not on mount — a
        // URL-driven (controlled) selection must survive the initial render.
        if (previousAgentRef.current !== agentId) {
            previousAgentRef.current = agentId;
            setSelectedPathRef.current(null);
        }
    }, [agentId]);

    React.useEffect(() => {
        if (previousRootRefreshRef.current === filesQuery.dataUpdatedAt) {
            return;
        }
        previousRootRefreshRef.current = filesQuery.dataUpdatedAt;
        setLoadedEntriesByDirectory({});
        setExpandedPaths(initialWorkspaceExpansion);
        setDirectoryLoadError(null);
    }, [filesQuery.dataUpdatedAt]);

    const loadDirectory = React.useCallback(
        async (nextPath: string) => {
            setDirectoryLoadError(null);
            if (loadedEntriesByDirectory[nextPath]) {
                return;
            }

            try {
                const result = await serverUtils.agent.workspaceFiles.fetch({
                    agentId,
                    includeHidden,
                    path: nextPath,
                    serverId,
                });
                setLoadedEntriesByDirectory((current) => ({
                    ...current,
                    [nextPath]: result.entries,
                }));
            } catch {
                setDirectoryLoadError('Unable to load this workspace folder.');
            }
        },
        [
            agentId,
            serverUtils.agent.workspaceFiles,
            includeHidden,
            loadedEntriesByDirectory,
            serverId,
        ]
    );

    React.useEffect(() => {
        if (filesQuery.data && initialDirectory) {
            setExpandedPaths((current) => withWorkspacePaths(current, [initialDirectory]));
            void loadDirectory(initialDirectory);
        }
    }, [filesQuery.data, initialDirectory, loadDirectory]);

    // A host-driven selection (the URL, a linked artifact) has to reveal itself.
    React.useEffect(() => {
        if (selectedPath) {
            setExpandedPaths((current) =>
                withWorkspacePaths(current, workspaceAncestorPaths(selectedPath))
            );
        }
    }, [selectedPath]);

    if (!agentId) {
        return (
            <WorkspaceArtifactEmpty
                detail="No active agent workspace is available."
                title="Workspace"
            />
        );
    }

    const treeAtStart = treeSide === 'start';
    const isSidebarRail = railVariant === 'sidebar';
    const fileViewControls = <WorkspaceArtifactControls artifact={artifact} />;

    const preview = (
        <WorkspaceBrowserPreview
            agentId={agentId}
            artifact={artifact}
            controls={
                isSidebarRail ? null : <WorkspaceArtifactInlineControls artifact={artifact} />
            }
            directoryLoadError={directoryLoadError}
            selectedPath={selectedPath}
        />
    );

    const railWidth = isSidebarRail ? sidebarRailWidth : fileSidebarWidth.width;
    const changeHiddenFiles = (value: boolean) => {
        setIncludeHidden(value);
        setLoadedEntriesByDirectory({});
        setExpandedPaths(initialWorkspaceExpansion);
        setDirectoryLoadError(null);
    };
    const fileRail = (
        <WorkspaceBrowserRail
            expandedPaths={expandedPaths}
            includeHidden={includeHidden}
            isPageRail={isSidebarRail}
            nodes={visibleNodes}
            onExpandedChange={(paths) => {
                for (const path of paths) {
                    if (path !== workspaceRootTreePath && !expandedPaths.has(path)) {
                        void loadDirectory(path);
                    }
                }
                setExpandedPaths(paths);
            }}
            onIncludeHiddenChange={changeHiddenFiles}
            onQueryChange={setQuery}
            onSelectDirectory={(path) => {
                setExpandedPaths((current) => withWorkspacePaths(current, [path]));
                void loadDirectory(path);
            }}
            onSelectFile={setSelectedPath}
            onWidthChange={fileSidebarWidth.setWidth}
            onWidthCommit={fileSidebarWidth.persistWidth}
            query={query}
            selectedPath={selectedPath}
            status={
                filesQuery.isPending
                    ? 'loading'
                    : filesQuery.error && !filesQuery.data
                      ? 'error'
                      : 'ready'
            }
            treeAtStart={treeAtStart}
            width={fileSidebarWidth.width}
        />
    );

    return (
        <WorkspaceBrowserFrame
            fileRail={fileRail}
            pageToolbar={
                isSidebarRail ? (
                    <WorkspacePageToolbar
                        includeHidden={includeHidden}
                        onIncludeHiddenChange={changeHiddenFiles}
                        selectedPath={selectedPath}
                    >
                        {fileViewControls}
                    </WorkspacePageToolbar>
                ) : null
            }
            preview={preview}
            railWidth={railWidth}
            treeAtStart={treeAtStart}
        />
    );
}
