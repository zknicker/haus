import { useNavigate, useParams } from 'react-router-dom';
import { openDesktopArtifact } from '../../features/chats/artifact-panel-context.tsx';
import type { HausResourceTarget } from '../../features/chats/haus-resource-link.ts';
import { getTurnDetailAccess } from '../../features/members/agent-profile/agent-activity-model.ts';
import { ChatFiles } from '../../features/servers/chat/chat-files.tsx';
import { useChatReferenceActivation } from '../../features/servers/chat/use-chat-reference-activation.ts';
import { useServerContext } from '../../features/servers/server-context.ts';
import { serverChatRoute } from '../../features/servers/server-routes.ts';
import { ThreadContent } from '../../features/servers/thread/thread-content.tsx';
import { useTabPresence } from '../../hooks/desktop-tabs/tab-presence.ts';
import { useDesktopPageOpeners } from '../../hooks/desktop-tabs/use-desktop-page-openers.ts';
import { useChatMessages } from '../../hooks/servers/use-chat-messages.ts';
import { requestMessageReveal } from '../../hooks/servers/use-pending-message-reveal.ts';
import { useThreadAnchor } from '../../hooks/threads/use-thread-anchor.ts';

/**
 * A Thread as a desktop page (`threads/:chatId/:anchorMessageId`, ADR 0039):
 * the same Thread surface the web's chat side pane hosts, spanning the tab
 * like a chat does. "View in chat" opens the chat scrolled to the anchor; an
 * Agent's artifact opens as its own page. Blank while the Thread loads.
 */
export function ThreadPageRoute() {
    const { anchorMessageId = '', chatId = '' } = useParams();
    const { server } = useServerContext();
    const navigate = useNavigate();
    const shown = useTabPresence().shown;
    const openers = useDesktopPageOpeners();
    const thread = useThreadAnchor(server.id, chatId, anchorMessageId);
    const openChat = (id: string) => navigate(serverChatRoute(server.slug, id));
    const activateReference = useChatReferenceActivation(openChat);
    const { anchor, chat } = thread;
    if (!(anchor && chat)) {
        return null;
    }
    const openArtifact = (target: HausResourceTarget) => {
        if (openers) {
            openDesktopArtifact(target, undefined, { openArtifactTab: openers.openArtifact });
        }
    };
    const viewInChat = () => {
        requestMessageReveal(chat.id, { id: anchor.id, sequence: anchor.sequence });
        openChat(chat.id);
    };
    return (
        <section aria-label="Thread" className="flex min-h-0 flex-1 flex-col bg-background">
            <ThreadContent
                active={shown}
                anchor={anchor}
                chat={chat}
                initialThreadChatId={anchor.task?.threadChatId}
                key={anchor.id}
                onOpenArtifact={openArtifact}
                onReferenceActivate={activateReference}
                onViewInChannel={viewInChat}
                readOnly={(chat.kind === 'dm' && chat.peerAgentRetired) || chat.archivedAt !== null}
                summary={thread.summary}
                takeover={false}
                turnDetailsAccess={getTurnDetailAccess(server.role)}
                width={null}
            />
        </section>
    );
}

/**
 * A chat's Files as a desktop page (`files/:chatId`): the Files list in a
 * centered reading column, read from the chat's transcript cache so it lists
 * the same loaded messages the chat shows.
 */
export function FilesPageRoute() {
    const { chatId = '' } = useParams();
    const { server } = useServerContext();
    const messages = useChatMessages(server.id, chatId);
    return (
        <section aria-label="Files" className="flex min-h-0 flex-1 flex-col bg-background">
            <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
                <ChatFiles messages={messages.data?.messages} />
            </div>
        </section>
    );
}
