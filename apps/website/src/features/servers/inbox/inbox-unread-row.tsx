import type { Agent, Chat } from '@haus/api';
import { conversationPreviewLine } from './conversation-preview.ts';
import type { UnreadRowReply } from './unread-row-composer.tsx';
import { UnreadChatMark } from './unread-row-parts.tsx';
import { type UnreadRowTriage, UnreadTriageRow } from './unread-triage-row.tsx';

/**
 * An unread Channel or DM as a card in the Unread feed (ADR 0050): its newest
 * waiting message and the Chat's own composer. The name opens the Chat
 * scrolled to that message, flashed.
 */
export function UnreadChatRow({
    agent,
    chat,
    name,
    triage,
    viewerDisplayName,
}: {
    agent: Agent | null;
    chat: Chat;
    /** The Chat's navigation name: the Channel's name, or the DM peer's. */
    name: string;
    triage: UnreadRowTriage;
    viewerDisplayName: null | string;
}) {
    const isDirect = chat.kind !== 'channel';
    const title = isDirect ? name : `#${name}`;
    const peerDisplayName = isDirect ? name : null;
    const fallbackLine =
        conversationPreviewLine(chat.lastMessage, { peerDisplayName, viewerDisplayName }) ??
        'no activity yet';

    return (
        <UnreadTriageRow
            triage={triage}
            view={{
                count: chat.unreadCount,
                label: name,
                mark: <UnreadChatMark agent={agent} chat={chat} name={name} />,
                messages: { chatId: chat.id, fallbackLine, serverId: chat.serverId },
                // A DM names its peer; "DM" says what kind of place that is.
                note: isDirect ? 'DM' : null,
                reply: replyInto(chat, name),
                time: chat.lastActivityAt,
                title,
            }}
        />
    );
}

/**
 * Where a row's reply goes: nowhere once the conversation takes no new
 * messages — an archived Channel, or a retired Agent's DM — as its own
 * composer goes away.
 */
function replyInto(
    chat: Chat,
    /** What the composer addresses, as the conversation's own composer does. */
    name: string
): UnreadRowReply {
    if (chat.archivedAt || (chat.kind === 'dm' && chat.peerAgentRetired)) {
        return { kind: 'closed' };
    }
    return {
        agentDmId: chat.peerAgentId ?? null,
        chatId: chat.id,
        chatName: name,
        kind: 'chat',
        serverId: chat.serverId,
    };
}
