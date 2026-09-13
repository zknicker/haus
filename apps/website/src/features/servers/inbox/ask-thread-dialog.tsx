import { openAskThreadAnchor } from '@haus/api';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useOpenAsks } from '../../../hooks/servers/use-open-asks.ts';
import { useServerContext } from '../server-context.ts';
import { ThreadPeekDialog } from '../thread/thread-peek-dialog.tsx';
import { useInboxView } from './inbox-view.ts';

/**
 * The Ask peek: opening an Inbox Ask row shows the Thread the answer is
 * written into, over the Inbox. `?ask=<messageId>` owns the open Ask.
 *
 * The Thread is peeked over its conversation and anchored on the Message it
 * hangs off, which for an Ask posted inside a Thread is that Thread's own
 * anchor rather than the Ask.
 *
 * The shared Thread surface owns answer controls beside each open question.
 */
export function AskThreadDialog() {
    const { server } = useServerContext();
    const { closeAsk, openAskId } = useInboxView();
    const asks = useOpenAsks(server.id);
    const chats = useChats(server.id);
    const item = openAskId
        ? asks.data?.find((candidate) => candidate.ask.messageId === openAskId)
        : undefined;
    const chat = item
        ? chats.data?.find((candidate) => candidate.id === item.conversationChatId)
        : undefined;

    if (!(item && chat)) {
        return null;
    }

    return (
        <ThreadPeekDialog
            anchor={openAskThreadAnchor(item)}
            ariaLabel={`Ask thread: ${item.ask.title}`}
            chat={chat}
            headerTitle={item.ask.title}
            initialThreadChatId={item.threadChatId}
            onClose={closeAsk}
            summary={null}
        />
    );
}
