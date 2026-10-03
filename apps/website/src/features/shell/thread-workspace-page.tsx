import { useNavigate } from 'react-router-dom';
import { requestMessageReveal } from '../../hooks/servers/use-pending-message-reveal.ts';
import { useThreadAnchor } from '../../hooks/threads/use-thread-anchor.ts';
import type { ThreadTabRef } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { openDesktopArtifact } from '../chats/artifact-panel-context.tsx';
import type { HausResourceTarget } from '../chats/haus-resource-link.ts';
import { getTurnDetailAccess } from '../members/agent-profile/agent-activity-model.ts';
import { useChatReferenceActivation } from '../servers/chat/use-chat-reference-activation.ts';
import { serverChatRoute } from '../servers/server-routes.ts';
import { ThreadContent } from '../servers/thread/thread-content.tsx';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';

/**
 * A Thread tab's body, in the side pane or full width: the same Thread surface
 * the chat side pane and the Task peek host, in a centered reading column that
 * fills the side pane and stays readable full width. Replying pins a preview
 * tab; "View in chat" opens the chat scrolled to the anchor, flashing it. The
 * tab's own close button closes it, so the Thread header shows none. An
 * Agent's artifact opens as a workspace tab. Blank
 * while the Thread loads; the always-mounted tab (`ThreadWorkspaceTab`)
 * closes a Thread whose chat or anchor is gone.
 */
export function ThreadWorkspacePage({ tabRef }: { tabRef: ThreadTabRef }) {
    const workspace = useBrowserWorkspace();
    const navigate = useNavigate();
    const thread = useThreadAnchor(
        workspace?.serverId ?? '',
        tabRef.chatId,
        tabRef.anchorMessageId
    );
    const slug = workspace?.server.slug ?? '';
    const openChat = (chatId: string) => navigate(serverChatRoute(slug, chatId));
    const activateReference = useChatReferenceActivation(openChat);
    const { anchor, chat } = thread;
    if (!(workspace && anchor && chat)) {
        return null;
    }
    const openParentChat = () => openChat(chat.id);
    // An Agent's artifact opens as its own tab beside this one; desktop has
    // no chat Artifact Panel for anything else.
    const openArtifact = (target: HausResourceTarget) =>
        openDesktopArtifact(target, undefined, { openArtifactTab: workspace.openArtifact });
    const viewInChat = () => {
        requestMessageReveal(chat.id, { id: anchor.id, sequence: anchor.sequence });
        openParentChat();
    };
    return (
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1">
            <ThreadContent
                active
                anchor={anchor}
                chat={chat}
                initialThreadChatId={anchor.task?.threadChatId}
                key={anchor.id}
                onOpenArtifact={openArtifact}
                onReferenceActivate={activateReference}
                onReplySent={() => workspace.pinTab(tabRef)}
                onViewInChannel={viewInChat}
                readOnly={(chat.kind === 'dm' && chat.peerAgentRetired) || chat.archivedAt !== null}
                summary={thread.summary}
                takeover={false}
                turnDetailsAccess={getTurnDetailAccess(workspace.server.role)}
                width={null}
            />
        </div>
    );
}
