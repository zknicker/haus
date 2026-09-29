import { EmptyState } from '@heroui-pro/react';
import { File01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useDesktopTabPane } from '../../hooks/desktop/use-desktop-window-commands.ts';
import { useBrowserWorkspace } from '../shell/browser-workspace-context.tsx';
import { bandHeightClassName } from '../shell/section-header.tsx';
import { ArtifactPanelChrome } from './chat-artifact-panel-chrome.tsx';
import type { ChatArtifactPanelState } from './chat-artifact-panel-state.ts';
import { WorkspaceBrowserContent } from './chat-artifact-workspace-content.tsx';
import { ChatSidePaneShell } from './chat-side-pane-shell.tsx';
import {
    getArtifactPanelTargetKey,
    type HausResourceTarget,
    isWorkspaceChatPaneTarget,
} from './haus-resource-link.ts';

export function ChatArtifactPanel({
    agentId,
    open = true,
    serverId,
    state,
    takeover = false,
}: {
    agentId: string;
    open?: boolean;
    serverId: string;
    state: ChatArtifactPanelState;
    takeover?: boolean;
}) {
    const browserActive = useBrowserWorkspace()?.state.activeId != null;
    // ⌘W closes the active tab, then the pane, and only then the window;
    // ⌘T opens the workspace tab while the pane is visible.
    useDesktopTabPane({
        active: open && state.visible && !browserActive,
        closeActiveTab: () => {
            if (state.activeKey) {
                state.closeActiveTarget();
            } else {
                state.toggleVisible();
            }
            return true;
        },
        openNewTab: () => {
            if (!agentId) {
                return false;
            }

            state.open({ agentId, kind: 'workspaceDirectory', path: '' });
            return true;
        },
    });

    return (
        <ChatSidePaneShell label="Artifacts" open={open && state.visible} takeover={takeover}>
            {(width) => (
                <ArtifactPanelBody
                    agentId={agentId}
                    serverId={serverId}
                    state={state}
                    width={width ?? undefined}
                />
            )}
        </ChatSidePaneShell>
    );
}

// The pane renders only the active target's content; tab selection is
// controlled state so the chrome and body stay in one Tabs root.
function ArtifactPanelBody({
    agentId,
    serverId,
    state,
    width,
}: {
    agentId: string;
    serverId: string;
    state: ChatArtifactPanelState;
    width?: number;
}) {
    const activeTarget = state.targets.find(
        (target) => getArtifactPanelTargetKey(target) === state.activeKey
    );
    const activeAgentId =
        activeTarget && 'agentId' in activeTarget ? (activeTarget.agentId ?? agentId) : agentId;

    return (
        <div
            className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
            style={width ? { width } : undefined}
        >
            <header
                className={`relative z-40 flex ${bandHeightClassName} shrink-0 items-center bg-background`}
                data-window-drag-region=""
            >
                <ArtifactPanelChrome
                    activeKey={state.activeKey}
                    activeTarget={activeTarget}
                    agentId={activeAgentId}
                    onClose={state.toggleVisible}
                    onCloseTarget={state.closeTarget}
                    onOpenTarget={state.open}
                    onSelectTarget={state.setActiveKey}
                    targets={state.targets}
                />
            </header>
            <div className="min-h-0 flex-1">
                {activeTarget ? (
                    <ArtifactPanelContent
                        agentId={activeAgentId}
                        // Workspace targets share one tab whose file selection
                        // morphs the target; a stable key keeps the browser
                        // (tree state, loaded folders) mounted across morphs.
                        key={
                            isWorkspaceChatPaneTarget(activeTarget)
                                ? `workspace:${activeAgentId}`
                                : state.activeKey
                        }
                        onOpenTarget={state.open}
                        serverId={serverId}
                        target={activeTarget}
                    />
                ) : (
                    <ArtifactPanelEmpty
                        detail="Open a workspace file from the + menu, or click a linked output in chat."
                        title="No artifacts open"
                    />
                )}
            </div>
        </div>
    );
}

function ArtifactPanelContent({
    agentId,
    onOpenTarget,
    serverId,
    target,
}: {
    agentId: string;
    onOpenTarget: (target: HausResourceTarget) => void;
    serverId: string;
    target: HausResourceTarget;
}) {
    // Stable identity: browser effects key on this callback.
    const openWorkspaceFile = React.useCallback(
        (path: null | string) => {
            if (path) {
                onOpenTarget({
                    agentId: 'agentId' in target ? (target.agentId ?? agentId) : agentId,
                    kind: 'workspaceFile',
                    path,
                });
            }
        },
        [agentId, onOpenTarget, target]
    );

    // The workspace is one unified tab: file content plus the workspace tree.
    // Picking a file in the tree morphs this tab's target in place, so the
    // tab title follows the open file.
    return (
        <WorkspaceBrowserContent
            agentId={agentId}
            initialDirectoryPath={workspaceInitialDirectory(target)}
            onSelectPath={openWorkspaceFile}
            selectedPath={target.kind === 'workspaceFile' ? target.path : null}
            serverId={serverId}
        />
    );
}

function workspaceInitialDirectory(target: HausResourceTarget) {
    if (target.kind === 'workspaceFile') {
        return target.path.split('/').slice(0, -1).join('/');
    }
    return target.path;
}

/**
 * Stock `EmptyState`, the same composition the chat transcript uses. This was
 * hand-built from divs — its own icon box, its own `text-sm` title, its own
 * centring — which is why an empty pane and an empty chat did not look like
 * the same product side by side.
 */
function ArtifactPanelEmpty({ detail, title }: { detail: string; title: string }) {
    return (
        <div className="grid h-full min-h-0 place-items-center">
            <EmptyState>
                <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                        <Icon aria-hidden="true" icon={File01Icon} />
                    </EmptyState.Media>
                    <EmptyState.Title>{title}</EmptyState.Title>
                    <EmptyState.Description>{detail}</EmptyState.Description>
                </EmptyState.Header>
            </EmptyState>
        </div>
    );
}
