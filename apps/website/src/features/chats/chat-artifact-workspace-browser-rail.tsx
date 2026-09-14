import { ResizablePaneRail } from '../../components/ui/resizable-pane-rail.tsx';
import type { WorkspaceTreeNode } from './chat-artifact-workspace-model.ts';
import {
    WorkspacePageRailSearch,
    WorkspaceRailToolbar,
} from './chat-artifact-workspace-toolbar.tsx';
import { WorkspaceFileTree } from './chat-artifact-workspace-tree.tsx';

interface WorkspaceBrowserRailProps {
    expandedPaths: ReadonlySet<string>;
    includeHidden: boolean;
    isPageRail: boolean;
    nodes: WorkspaceTreeNode[];
    onExpandedChange: (paths: Set<string>) => void;
    onIncludeHiddenChange: (value: boolean) => void;
    onQueryChange: (value: string) => void;
    onSelectDirectory: (path: string) => void;
    onSelectFile: (path: string) => void;
    onWidthChange: (width: number) => void;
    onWidthCommit: (width: number) => void;
    query: string;
    selectedPath: null | string;
    status: 'loading' | 'error' | 'ready';
    treeAtStart: boolean;
    width: number;
}

export function WorkspaceBrowserRail({
    expandedPaths,
    includeHidden,
    isPageRail,
    nodes,
    onExpandedChange,
    onIncludeHiddenChange,
    onQueryChange,
    onSelectDirectory,
    onSelectFile,
    onWidthChange,
    onWidthCommit,
    query,
    selectedPath,
    status,
    treeAtStart,
    width,
}: WorkspaceBrowserRailProps) {
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
                <WorkspacePageRailSearch onQueryChange={onQueryChange} query={query} />
            ) : (
                <WorkspaceRailToolbar
                    includeHidden={includeHidden}
                    onIncludeHiddenChange={onIncludeHiddenChange}
                    onQueryChange={onQueryChange}
                    query={query}
                />
            )}
            <div className="flex min-h-0 flex-1 overflow-hidden px-1 pb-2">
                {status === 'loading' ? (
                    <div aria-busy="true">
                        <span className="sr-only">Loading workspace files</span>
                    </div>
                ) : status === 'error' ? (
                    <p className="text-danger text-sm" role="alert">
                        Unable to browse this workspace.
                    </p>
                ) : (
                    <WorkspaceFileTree
                        expandedPaths={expandedPaths}
                        hasQuery={query.trim().length > 0}
                        nodes={nodes}
                        onExpandedChange={onExpandedChange}
                        onSelectDirectory={onSelectDirectory}
                        onSelectFile={onSelectFile}
                        selectedPath={selectedPath}
                    />
                )}
            </div>
        </aside>
    );
}
