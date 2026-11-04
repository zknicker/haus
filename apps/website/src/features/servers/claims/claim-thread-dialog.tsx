import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useClaims } from '../../../hooks/servers/use-claims.ts';
import { useServerContext } from '../server-context.ts';
import { ThreadPeekDialog } from '../thread/thread-peek-dialog.tsx';
import { useClaimView } from './claim-view.ts';
import { useClaimThread } from './use-claim-thread.ts';

/**
 * The Claim peek: opening a claim from the Board or List lenses shows its
 * Thread work surface over the Tasks page. `?claim=<messageId>` owns the open
 * claim, so deep links and Back work. A claim on a message inside a Thread
 * opens the Thread it sits in, under its parent Channel or DM.
 */
export function ClaimThreadDialog() {
    const { server } = useServerContext();
    const { closeClaim, openClaimId } = useClaimView();
    // The peek addresses one claim by id, so it reads past the Board's lens: a
    // background-tier claim the Board hides still opens from `?claim=`.
    const claims = useClaims(server.id, undefined, {
        enabled: openClaimId !== null,
        includeBackground: true,
    });
    const chats = useChats(server.id);
    const item = openClaimId
        ? claims.data?.claims.find((candidate) => candidate.claim.messageId === openClaimId)
        : undefined;
    // `claim.chatId` is always the top-level Channel or DM, a Thread claim's included.
    const chat = item
        ? chats.data?.find((candidate) => candidate.id === item.claim.chatId)
        : undefined;
    const thread = useClaimThread(server.id, item);

    if (!(item && chat && thread)) {
        return null;
    }

    return (
        <ThreadPeekDialog
            anchor={thread.anchor}
            ariaLabel={`Claim #${item.claim.number} thread`}
            chat={chat}
            claimMessage={thread.claimMessage}
            headerTitle={`Claim #${item.claim.number}`}
            initialThreadChatId={thread.threadChatId}
            onClose={closeClaim}
            summary={thread.summary}
        />
    );
}
