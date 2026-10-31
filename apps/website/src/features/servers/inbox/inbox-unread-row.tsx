import type { Agent, Chat, ChatMessage, UnreadThread } from '@haus/api';
import { useUnreadPreview } from '../../../hooks/inbox/use-unread-previews.ts';
import type { HumanDirectory } from '../human-identity.ts';
import { threadTitles } from '../thread/thread-target.ts';
import {
    conversationPreviewLine,
    threadAnchorLine,
    threadReplyPreviewLine,
    waitingMessageLine,
} from './conversation-preview.ts';
import type { UnreadRowReply } from './unread-row-composer.tsx';
import { UnreadChatMark } from './unread-row-parts.tsx';
import { type UnreadRowTriage, UnreadTriageRow } from './unread-triage-row.tsx';

/** Who a row's messages are by: the live Agents and members, as the transcript names them. */
export interface UnreadAuthors {
    agentById: ReadonlyMap<string, Agent>;
    humans: HumanDirectory;
}

/**
 * An unread Channel or DM as a triage row (ADR 0050). Collapsed, it quotes
 * its newest waiting message; open, it renders that message and the Chat's
 * own composer. The name opens the Chat, which lands on its first unread
 * message.
 */
export function UnreadChatRow({
    agent,
    authors,
    chat,
    name,
    triage,
    viewerDisplayName,
}: {
    agent: Agent | null;
    authors: UnreadAuthors;
    chat: Chat;
    /** The Chat's navigation name: the Channel's name, or the DM peer's. */
    name: string;
    triage: UnreadRowTriage;
    viewerDisplayName: null | string;
}) {
    const isDirect = chat.kind !== 'channel';
    const title = isDirect ? name : `#${name}`;
    const peerDisplayName = isDirect ? name : null;
    const preview = useUnreadPreview(chat.serverId, chat.id);
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
                messages: {
                    chatId: chat.id,
                    conversationChatId: chat.id,
                    fallbackLine,
                    serverId: chat.serverId,
                },
                // A DM names its peer; "DM" says what kind of place that is.
                note: isDirect ? 'DM' : null,
                preview: (
                    <WaitingLine
                        authors={authors}
                        fallback={fallbackLine}
                        message={preview?.messages.at(-1) ?? null}
                        peerDisplayName={peerDisplayName}
                    />
                ),
                reply: replyInto(chat, name, { agentDmId: chat.peerAgentId ?? null, kind: 'chat' }),
                time: chat.lastActivityAt,
                title,
            }}
        />
    );
}

/**
 * An unread Thread as a triage row: "Thread in #channel" (or "Thread in DM" —
 * a DM context is labeled "DM", never its peer). Open, it names the message
 * the Thread hangs off, renders its newest waiting reply, and replies into
 * the Thread. The name opens the Thread itself, at its first unread reply.
 */
export function UnreadThreadRow({
    agent,
    authors,
    name,
    parent,
    thread,
    triage,
    viewerDisplayName,
}: {
    agent: Agent | null;
    authors: UnreadAuthors;
    /** The parent's navigation name. */
    name: string;
    parent: Chat;
    thread: UnreadThread;
    triage: UnreadRowTriage;
    viewerDisplayName: null | string;
}) {
    const place = parent.kind === 'channel' ? `#${name}` : 'DM';
    const title = `Thread in ${place}`;
    // The anchor rides the one preview read, so naming it costs no request per row.
    const preview = useUnreadPreview(thread.serverId, thread.threadChatId);
    const anchor = preview?.anchor ?? null;
    const fallbackLine = threadReplyPreviewLine(thread.latestReply, viewerDisplayName);

    return (
        <UnreadTriageRow
            triage={triage}
            view={{
                count: thread.unreadCount,
                label: title,
                mark: <UnreadChatMark agent={agent} chat={parent} name={name} />,
                messages: {
                    chatId: thread.threadChatId,
                    conversationChatId: thread.parentChatId,
                    fallbackLine,
                    serverId: thread.serverId,
                },
                note: anchor ? anchorLine(anchor, authors) : null,
                preview: (
                    <WaitingLine
                        authors={authors}
                        fallback={fallbackLine}
                        message={preview?.messages.at(-1) ?? null}
                        peerDisplayName={null}
                    />
                ),
                // Addressed as the Thread view's own composer is: "Thread — #all".
                reply: replyInto(
                    parent,
                    threadTitles(parent, thread.anchorMessageId, authors.humans).header,
                    { anchorMessageId: thread.anchorMessageId, kind: 'thread' }
                ),
                time: thread.lastActivityAt,
                title,
            }}
        />
    );
}

/**
 * A collapsed row's quote of its newest waiting message: the author a step
 * brighter than what they said, so a column of rows scans by who is waiting.
 * Until the previews settle, or for a row they do not name yet, it quotes the
 * row's own one line.
 */
function WaitingLine({
    authors,
    fallback,
    message,
    peerDisplayName,
}: {
    authors: UnreadAuthors;
    fallback: string;
    message: ChatMessage | null;
    peerDisplayName: null | string;
}) {
    if (!message) {
        return fallback;
    }
    const { author, text } = waitingMessageLine({
        authorName: messageAuthorName(message, authors),
        content: message.content,
        peerDisplayName,
    });
    return author ? (
        <>
            <span className="text-foreground">{author}:</span> {text}
        </>
    ) : (
        text
    );
}

/**
 * Where a row's reply goes: nowhere once the conversation takes no new
 * messages — an archived Channel, or a retired Agent's DM — as its own
 * composer goes away. A Thread answers to its parent's state.
 */
function replyInto(
    chat: Chat,
    /** What the composer addresses, as the conversation's own composer does. */
    name: string,
    target: { agentDmId: null | string; kind: 'chat' } | { anchorMessageId: string; kind: 'thread' }
): UnreadRowReply {
    if (chat.archivedAt || (chat.kind === 'dm' && chat.peerAgentRetired)) {
        return { kind: 'closed' };
    }
    return { ...target, chatId: chat.id, chatName: name, serverId: chat.serverId };
}

/** The anchor's author, named as the transcript names them: the live Agent or member first. */
function anchorLine(message: ChatMessage, authors: UnreadAuthors): string {
    const { author } = message;
    return threadAnchorLine({
        authorName: messageAuthorName(message, authors),
        content: message.content,
        isViewer: author.kind === 'human' && authors.humans.isSelf(author.userId),
    });
}

function messageAuthorName(message: ChatMessage, { agentById, humans }: UnreadAuthors) {
    const { author } = message;
    if (author.kind === 'agent') {
        return agentById.get(author.agentId)?.displayName ?? author.profile?.displayName ?? null;
    }
    return humans.member(author.userId)
        ? humans.name(author.userId)
        : (author.profile?.displayName ?? null);
}
