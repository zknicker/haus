import { ResizablePaneRail } from '../../components/ui/resizable-pane-rail.tsx';
import {
    WorkspacePageRailSearch,
    WorkspaceRailToolbar,
} from './chat-artifact-workspace-toolbar.tsx';
import { WorkspaceFileTree } from './chat-artifact-workspace-tree.tsx';
import type { WorkspaceTreeState } from './use-workspace-tree-state.ts';

interface WorkspaceBrowserRailProps {
    includeHidden: boolean;
    isPageRail: boolean;
    onIncludeHiddenChange: (value: boolean) => void;
    onSelectFile: (path: string) => void;
    onWidthChange: (width: number) => void;
    onWidthCommit: (width: number) => void;
    /** The rail tops the page beside a column bar; see `WorkspacePageRailSearch`. */
    searchOnBandLine?: boolean;
    selectedPath: null | string;
    tree: WorkspaceTreeState;
    treeAtStart: boolean;
    width: number;
}

export function WorkspaceBrowserRail({
    includeHidden,
    isPageRail,
    onIncludeHiddenChange,
    onSelectFile,
    onWidthChange,
    onWidthCommit,
    searchOnBandLine = false,
    selectedPath,
    tree,
    treeAtStart,
    width,
}: WorkspaceBrowserRailProps) {
    const { onQueryChange, query, status } = tree;
    return (
        <aside
            className={`relative flex h-full min-h-0 flex-col overflow-x-hidden border-separator ${treeAtStart ? 'border-e' : 'border-s'}`}
        >
            {isPageRail ? null : (
                <ResizablePaneRail
                    maxWidth={440}
                    minWidth={220}
                    onWidthChange={onWidthChange}
                    onWidthCommit={onWidthCommit}
                    side={treeAtStart ? 'right' : 'left'}
                    width={width}
                />
            )}
            {isPageRail ? (
                <WorkspacePageRailSearch
                    onBandLine={searchOnBandLine}
                    onQueryChange={onQueryChange}
                    query={query}
                />
            ) : (
                <WorkspaceRailToolbar
                    includeHidden={includeHidden}
                    onIncludeHiddenChange={onIncludeHiddenChange}
                    onQueryChange={onQueryChange}
                    query={query}
                />
            )}
            {/* `px-1` plus FileTree's own one-step padding puts row edges on the
                search field's two-step inset, so the rail reads as one column. */}
            <div className="flex min-h-0 flex-1 overflow-hidden px-1 pb-2">
                {status === 'loading' ? (
                    <div aria-busy="true">
                        <span className="sr-only">Loading workspace files</span>
                    </div>
                ) : status === 'error' ? (
                    <p className="p-1 text-danger text-sm" role="alert">
                        Unable to browse this workspace.
                    </p>
                ) : (
                    <WorkspaceFileTree
                        expandedKeys={tree.expandedKeys}
                        hasQuery={tree.hasQuery}
                        nodes={tree.nodes}
                        onExpandedChange={tree.onExpandedChange}
                        onSelectFile={onSelectFile}
                        onToggleDirectory={tree.onToggleDirectory}
                        selectedPath={selectedPath}
                    />
                )}
            </div>
        </aside>
    );
}
