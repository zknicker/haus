import type { Chat, ChatMessage } from '@haus/api';
import type * as React from 'react';
import type { ChatSidePaneKind } from '../../../hooks/pane/use-chat-side-pane.ts';
import { ChatArtifactPanel } from '../../chats/chat-artifact-panel.tsx';
import type { ChatArtifactPanelState } from '../../chats/chat-artifact-panel-state.ts';
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
    return (
        <>
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
        </>
    );
}
