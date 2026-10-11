import type { ActiveCloudAgentWork } from '@haus/api';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { useActiveCloudAgentWork } from '../../hooks/servers/use-cloud-agent-work.ts';
import { useThreadAnchorMessage } from '../../hooks/threads/use-thread-anchor-message.ts';
import { useServerContext } from '../servers/server-context.ts';
import { ThreadPeekDialog } from '../servers/thread/thread-peek-dialog.tsx';
import {
    activeCloudAgentWorkLocation,
    carriedWorkThreadAnchor,
} from './active-cloud-agent-work-location.ts';
import { useCloudAgentWorkView } from './use-cloud-agent-work-view.ts';

/**
 * The Cloud Agent work peek: opening a work row shows its work Thread over the
 * page it was opened from, rather than navigating into the Chat.
 * `?work=<workId>` owns which one is open. Only a `work-thread` location peeks;
 * a work the viewer reaches through another linking Message opens that
 * Message instead (`useOpenCloudAgentWork`).
 */
export function CloudAgentWorkDialog() {
    const { server } = useServerContext();
    const { openWorkId } = useCloudAgentWorkView();
    const active = useActiveCloudAgentWork(server.id);
    const item = openWorkId
        ? active.data?.find((candidate) => candidate.work.id === openWorkId)
        : undefined;
    const location = item ? activeCloudAgentWorkLocation(item) : null;

    if (!(item && location?.kind === 'work-thread')) {
        return null;
    }

    return (
        <WorkThreadPeek
            anchorMessageId={location.anchorMessageId}
            item={item}
            threadChatId={location.threadChatId}
        />
    );
}

/**
 * The work Thread hangs off its anchor in the conversation, which for work
 * launched inside a Thread is that Thread's own anchor rather than the launch
 * Message.
 */
function WorkThreadPeek({
    anchorMessageId,
    item,
    threadChatId,
}: {
    anchorMessageId: string;
    item: ActiveCloudAgentWork;
    threadChatId: string;
}) {
    const { server } = useServerContext();
    const { closeWork } = useCloudAgentWorkView();
    const chats = useChats(server.id);
    const carried = carriedWorkThreadAnchor(item, anchorMessageId);
    const fetched = useThreadAnchorMessage(
        server.id,
        item.conversationChatId,
        carried ? null : anchorMessageId
    );
    const anchor = carried ?? fetched.anchor;
    const chat = chats.data?.find((candidate) => candidate.id === item.conversationChatId);

    if (!(anchor && chat)) {
        return null;
    }

    return (
        <ThreadPeekDialog
            anchor={anchor}
            ariaLabel={`Cloud Agent work: ${item.work.title}`}
            chat={chat}
            headerTitle={item.work.title}
            initialThreadChatId={threadChatId}
            onClose={closeWork}
            summary={null}
        />
    );
}
