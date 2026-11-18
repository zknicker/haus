import * as React from 'react';
import { useResizablePaneWidth } from '../../components/ui/resizable-pane-rail.tsx';
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
import { WorkspaceArtifactEmpty } from './chat-artifact-workspace-preview.tsx';
import {
    type WorkspaceBarPlacement,
    WorkspacePageToolbar,
} from './chat-artifact-workspace-toolbar.tsx';
import { useWorkspaceTreeState } from './use-workspace-tree-state.ts';

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
    pageTitle,
    pageToolbarLeading,
    pageMenuSections,
    pageBarPlacement = 'page',
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
    /** The sidebar-rail toolbar's label while no file is open; null when the host titles the page. */
    pageTitle?: null | string;
    /** Host-owned start of the sidebar-rail toolbar (e.g. the Agent profile breadcrumb);
        replaces the path label so the page keeps one top bar. */
    pageToolbarLeading?: React.ReactNode;
    /** Host sections for the sidebar-rail toolbar's one "…" menu (e.g. the Agent lifecycle verbs). */
    pageMenuSections?: React.ReactNode;
    /** Where the sidebar-rail toolbar renders: its own row, the shell band of
        a host page that has one (the Agent profile on the web), or over the
        content column beside a full-height rail (that page in a desktop tab). */
    pageBarPlacement?: WorkspaceBarPlacement;
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
    const tree = useWorkspaceTreeState({
        agentId,
        includeHidden,
        initialDirectoryPath,
        selectedPath,
        serverId,
    });
    const fileSidebarWidth = useResizablePaneWidth({
        defaultWidth: 300,
        maxWidth: 440,
        minWidth: 220,
        storageKey: sidebarStorageKey,
    });

    // The open file belongs to the Agent it came from; clear it only when the
    // Agent actually changes, not on mount — a URL-driven (controlled)
    // selection must survive the initial render.
    const setSelectedPathRef = React.useRef(setSelectedPath);
    setSelectedPathRef.current = setSelectedPath;
    const previousAgentRef = React.useRef(agentId);
    React.useEffect(() => {
        if (previousAgentRef.current !== agentId) {
            previousAgentRef.current = agentId;
            setSelectedPathRef.current(null);
        }
    }, [agentId]);

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
            selectedPath={selectedPath}
        />
    );

    const railWidth = isSidebarRail ? sidebarRailWidth : fileSidebarWidth.width;
    const toolbarOverPreview = isSidebarRail && pageBarPlacement === 'column';
    const fileRail = (
        <WorkspaceBrowserRail
            includeHidden={includeHidden}
            isPageRail={isSidebarRail}
            onIncludeHiddenChange={setIncludeHidden}
            onSelectFile={setSelectedPath}
            onWidthChange={fileSidebarWidth.setWidth}
            onWidthCommit={fileSidebarWidth.persistWidth}
            searchOnBandLine={toolbarOverPreview}
            selectedPath={selectedPath}
            tree={tree}
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
                        leading={pageToolbarLeading}
                        menuSections={pageMenuSections}
                        onCloseFile={() => setSelectedPath(null)}
                        onIncludeHiddenChange={setIncludeHidden}
                        placement={pageBarPlacement}
                        selectedPath={selectedPath}
                        title={pageTitle}
                    >
                        {fileViewControls}
                    </WorkspacePageToolbar>
                ) : null
            }
            preview={preview}
            railWidth={railWidth}
            toolbarOverPreview={toolbarOverPreview}
            treeAtStart={treeAtStart}
        />
    );
}
