import type { Chat, ChatMessage } from '@haus/api';
import type * as React from 'react';
import { type ChatSidePaneKind, useChatSidePane } from '../../../hooks/pane/use-chat-side-pane.ts';
import { ChatArtifactPanel } from '../../chats/chat-artifact-panel.tsx';
import type { ChatArtifactPanelState } from '../../chats/chat-artifact-panel-state.ts';
import { ShellSidePane } from '../../shell/shell-side-pane.tsx';
import { ChatFilesPanel } from './chat-files.tsx';

export function shouldTakeOverChatSidePanel({
    activePane,
    artifactVisible,
    filesVisible,
    hasThread,
    takeover,
}: {
    activePane: ChatSidePaneKind;
    artifactVisible: boolean;
    filesVisible: boolean;
    hasThread: boolean;
    takeover: boolean;
}) {
    return Boolean(
        takeover &&
            ((activePane === 'artifact' && artifactVisible) ||
                (activePane === 'files' && filesVisible) ||
                (activePane === 'thread' && hasThread))
    );
}

/**
 * The website chat's own side panel: Artifact Panel, Files, and Thread share
 * it, portaled into the shell's side-pane column. Desktop has no chat side
 * panel; those surfaces open as workspace tabs in its one side pane.
 */
export function ChatViewSidePanel({
    artifactState,
    chat,
    filesPane,
    messages,
    takeover,
    threadPanel,
}: {
    artifactState: ChatArtifactPanelState;
    chat: Chat;
    filesPane: { close: () => void; visible: boolean };
    messages: ChatMessage[] | undefined;
    takeover: boolean;
    threadPanel: React.ReactNode;
}) {
    const activePane = useChatSidePane(chat.id);
    return (
        <ShellSidePane
            takeover={shouldTakeOverChatSidePanel({
                activePane,
                artifactVisible: artifactState.visible,
                filesVisible: filesPane.visible,
                hasThread: Boolean(threadPanel),
                takeover,
            })}
        >
            <ChatArtifactPanel
                agentId={chat.peerAgentId ?? ''}
                open={artifactState.visible}
                serverId={chat.serverId}
                state={artifactState}
                takeover={takeover}
            />
            <ChatFilesPanel
                messages={messages}
                onClose={filesPane.close}
                open={filesPane.visible}
                takeover={takeover}
            />
            {threadPanel}
        </ShellSidePane>
    );
}
