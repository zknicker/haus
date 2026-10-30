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

/**
 * An unread Thread's newest reply as its row's one line: `Forge replied in
 * thread: …`. The row's title names the parent, so the line says where the
 * reply sits and who wrote it; the viewer's own reply reads `You replied`.
 * Null — a reply whose author no longer resolves — states the fact alone.
 */
export function threadReplyPreviewLine(
    latestReply: ChatLastMessage | null,
    viewerDisplayName: null | string
): string {
    if (!latestReply) {
        return 'New replies in thread';
    }
    const author = authorPrefix(latestReply.authorDisplayName, { viewerDisplayName }) ?? 'Someone';
    const line = messagePreviewLine(latestReply.content);
    return line === '' ? `${author} replied in thread` : `${author} replied in thread: ${line}`;
}

/**
 * A collapsed Unread row's quote of the newest message waiting in it, split
 * so the row can set the author apart: `Blippy` then `Thursday release check…`.
 * It follows `conversationPreviewLine`'s rule: in a DM the peer speaks
 * unattributed, since the row's title already names them. A waiting message
 * is never the viewer's own, so there is no `You`. An author no longer named
 * leaves the quote alone, and a message with no text left to quote states its
 * author alone, which is all there is left to say about it.
 */
export function waitingMessageLine({
    authorName,
    content,
    peerDisplayName,
}: {
    authorName: null | string;
    content: string;
    peerDisplayName: null | string;
}): { author: null | string; text: string } {
    const text = messagePreviewLine(content);
    const author = authorName && authorName !== peerDisplayName ? authorName : null;
    if (text === '') {
        return { author: null, text: authorName ?? 'Attachment' };
    }
    return { author, text };
}

/**
 * The message an unread Thread hangs off, as its card's muted context line:
 * `on Beacon: Thursday Christmas check…`. The viewer's own message reads
 * `on your message: …`, and an author no longer named reads as the quote
 * alone. A message with no text left to quote names only its author.
 */
export function threadAnchorLine({
    authorName,
    content,
    isViewer,
}: {
    authorName: null | string;
    content: string;
    isViewer: boolean;
}): string {
    const who = isViewer ? 'your message' : authorName;
    const line = messagePreviewLine(content);
    if (line === '') {
        return who ? `on ${who}` : 'on a message';
    }
    return who ? `on ${who}: ${line}` : `on: ${line}`;
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
