import type { Chat, ChatMessage } from '@haus/api';
import { useChatSidePane } from '../../../hooks/pane/use-chat-side-pane.ts';
import type { ChatArtifactPanelState } from '../../chats/chat-artifact-panel-state.ts';
import { ChatArtifactPanel } from '../../chats/chat-artifact-panel.tsx';
import { ShellSidePane } from '../../shell/shell-side-pane.tsx';
import { ChatFilesPanel } from './chat-files.tsx';

/**
 * The website chat's own side panel: the Artifact Panel and Attachments share
 * it, portaled into the shell's side-pane column. Desktop has no chat side
 * panel; those surfaces open as workspace tabs in its one side pane.
 */
export function ChatViewSidePanel({
    artifactState,
    chat,
    filesPane,
    messages,
    takeover,
}: {
    artifactState: ChatArtifactPanelState;
    chat: Chat;
    filesPane: { close: () => void; visible: boolean };
    messages: readonly Pick<ChatMessage, 'attachments' | 'serverId'>[] | undefined;
    takeover: boolean;
}) {
    const activePane = useChatSidePane(chat.id);
    const paneVisible = activePane === 'artifact' ? artifactState.visible : filesPane.visible;
    return (
        <ShellSidePane takeover={takeover && paneVisible}>
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
        </ShellSidePane>
    );
}
