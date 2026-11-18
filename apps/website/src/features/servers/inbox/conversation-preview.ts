import type { ChatLastMessage } from '@haus/api';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';

/** Who the row already names, so the quote does not name them again. */
export interface ConversationSpeakers {
    /** The Agent a DM is with. In their own DM, every line is theirs. */
    peerDisplayName?: null | string;
    viewerDisplayName?: null | string;
}

/**
 * A Chat's newest message as the one line a row quotes: who spoke, then what
 * they said, flattened by the same helper every other quoting surface uses.
 *
 * The prefix is dropped when the row's own title already answers it. Tiny's DM
 * read `Tiny: Finished the audit` — the name stated twice, once as the row's
 * title and once inside its own quote — so in a DM the peer speaks unattributed
 * and only the viewer's own line is marked, as `You:`. A Channel keeps every
 * name, because there the author is the fact the reader is scanning for.
 *
 * Null is the Chat that holds no message yet — the row states that itself
 * rather than quoting an empty line. A message whose content flattens to
 * nothing (an attachment on its own) still names its author, which is all
 * there is left to say about it.
 *
 * Authors are matched by display name because `ChatLastMessage` carries no
 * author id. This is a presentation choice inside one row, never identity:
 * the worst a collision does is drop or add a prefix.
 */
export function conversationPreviewLine(
    lastMessage: ChatLastMessage | null,
    speakers: ConversationSpeakers = {}
): null | string {
    if (!lastMessage) {
        return null;
    }

    const line = messagePreviewLine(lastMessage.content);
    const prefix = authorPrefix(lastMessage.authorDisplayName, speakers);

    if (line === '') {
        return prefix ?? lastMessage.authorDisplayName;
    }
    return prefix ? `${prefix}: ${line}` : line;
}

function authorPrefix(author: string, speakers: ConversationSpeakers): null | string {
    if (speakers.viewerDisplayName && author === speakers.viewerDisplayName) {
        return 'You';
    }
    if (speakers.peerDisplayName && author === speakers.peerDisplayName) {
        return null;
    }
    return author;
}
