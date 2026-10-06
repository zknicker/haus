import type { ReactNode } from 'react';
import type { WorkspaceArtifact } from './chat-artifact-workspace-file.tsx';
import {
    WorkspaceArtifactContent,
    WorkspaceArtifactEmpty,
} from './chat-artifact-workspace-preview.tsx';

export function WorkspaceBrowserPreview({
    agentId,
    artifact,
    controls,
    selectedPath,
}: {
    agentId: string;
    artifact: WorkspaceArtifact;
    controls?: ReactNode;
    selectedPath: null | string;
}) {
    return (
        <section className="h-full min-h-0 min-w-0 overflow-hidden">
            {selectedPath ? (
                <WorkspaceArtifactContent
                    agentId={agentId}
                    artifact={artifact}
                    controls={controls}
                    target={{ kind: 'workspaceFile', path: selectedPath }}
                />
            ) : (
                <WorkspaceArtifactEmpty
                    detail="Select a Markdown, HTML, image, or text file from the workspace sidebar."
                    title="No file selected"
                />
            )}
        </section>
    );
}

/**
 * The rail and the content column, with the page's bar either across both
 * (`toolbarOverPreview` false: its own row, or portaled to the shell band) or
 * over the content column only, so the rail runs the body's full height.
 */
export function WorkspaceBrowserFrame({
    fileRail,
    pageToolbar,
    preview: previewPane,
    railWidth,
    toolbarOverPreview = false,
    treeAtStart,
}: {
    fileRail: ReactNode;
    pageToolbar?: ReactNode;
    preview: ReactNode;
    railWidth: number;
    toolbarOverPreview?: boolean;
    treeAtStart: boolean;
}) {
    const preview = toolbarOverPreview ? (
        <div className="flex min-h-0 min-w-0 flex-col">
            {pageToolbar}
            <div className="min-h-0 flex-1">{previewPane}</div>
        </div>
    ) : (
        previewPane
    );
    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
            {toolbarOverPreview ? null : pageToolbar}
            <div
                className="grid min-h-0 flex-1 overflow-hidden"
                style={{
                    gridTemplateColumns: treeAtStart
                        ? `${railWidth}px minmax(0, 1fr)`
                        : `minmax(0, 1fr) ${railWidth}px`,
                }}
            >
                {treeAtStart ? fileRail : preview}
                {treeAtStart ? preview : fileRail}
            </div>
        </div>
    );
}
