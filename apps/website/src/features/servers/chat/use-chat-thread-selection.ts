import type { ChatMessage, ThreadSummary } from '@haus/api';
import * as React from 'react';
import { setChatSidePane } from '../../../hooks/pane/use-chat-side-pane.ts';
import type { ClaimThread } from '../claims/use-claim-thread.ts';

/** A `?claim=` link's Thread: the claim's own, or the one its message sits in. */
export type ChatInitialClaim = ClaimThread;

export interface ChatThreadSelection {
    anchor: ChatMessage;
    /** The Claim the Thread was opened on when its message sits inside the Thread. */
    claimMessage?: ChatMessage | null;
    initialSummary: ThreadSummary | null;
    initialThreadChatId?: string;
}

export function useChatThreadSelection(chatId: string, initialClaim?: ChatInitialClaim) {
    const [selection, setSelection] = React.useState<ChatThreadSelection | null>(() =>
        initialClaim ? claimSelection(initialClaim) : null
    );
    const initialClaimIdRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!initialClaim) {
            initialClaimIdRef.current = null;
            return;
        }
        if (initialClaimIdRef.current === initialClaim.claimMessageId) {
            return;
        }
        const previousClaimId = initialClaimIdRef.current;
        initialClaimIdRef.current = initialClaim.claimMessageId;
        setSelection((current) =>
            !current || selectionClaimId(current) === previousClaimId
                ? claimSelection(initialClaim)
                : current
        );
        setChatSidePane(chatId, 'thread');
    }, [chatId, initialClaim]);

    return [selection, setSelection] as const;
}

function claimSelection(claim: ChatInitialClaim): ChatThreadSelection {
    return {
        anchor: claim.anchor,
        initialSummary: claim.summary,
        initialThreadChatId: claim.threadChatId,
        claimMessage: claim.claimMessage,
    };
}

/** The claim a selection opened: its in-Thread message, else its anchor's own. */
function selectionClaimId(selection: ChatThreadSelection) {
    return selection.claimMessage?.id ?? selection.anchor.id;
}
