import type { Agent, NeedsYouRow } from '@haus/api';
import type { HumanDirectory } from '../human-identity.ts';
import { serverChatRoute, serverChatThreadRoute } from '../server-routes.ts';

/**
 * One Needs you row as the Inbox and a notification read it: who addressed
 * the viewer, what they said, and where. The Server row rides along so the
 * row can be opened and marked Done.
 */
export interface NeedsYouRowView {
    /** The Agent whose face leads the row, when an Agent wrote the message. */
    authorAgentId: null | string;
    authorAvatarUrl: null | string;
    authorName: string;
    /** The Chat the row stands for; one Chat has at most one row. */
    id: string;
    /** Where the addressing happened, for a mention or reply; a DM is its own place. */
    place: null | string;
    preview: string;
    row: NeedsYouRow;
}

export interface NeedsYouNames {
    agents: readonly Agent[];
    humans: HumanDirectory;
}

export function toNeedsYouRowView(row: NeedsYouRow, names: NeedsYouNames): NeedsYouRowView {
    const author = row.latest.author;
    const agent =
        author.kind === 'agent'
            ? (names.agents.find((candidate) => candidate.id === author.agentId) ?? null)
            : null;

    return {
        authorAgentId: author.kind === 'agent' ? author.agentId : null,
        authorAvatarUrl:
            agent?.avatarUrl ??
            author.profile?.avatarUrl ??
            (author.kind === 'human' ? names.humans.avatarUrl(author.userId) : null),
        authorName: needsYouAuthorName(row, names),
        id: row.chatId,
        place: needsYouPlace(row),
        preview: row.latest.preview,
        row,
    };
}

/**
 * The live name first, then the name stored with the message, then a stable
 * id label — so a retired Agent or departed member still reads as someone.
 */
export function needsYouAuthorName(row: NeedsYouRow, names: NeedsYouNames): string {
    const author = row.latest.author;
    if (author.kind === 'agent') {
        const agent = names.agents.find((candidate) => candidate.id === author.agentId);
        return (
            agent?.displayName ?? author.profile?.displayName ?? `Agent ${author.agentId.slice(-6)}`
        );
    }
    return author.profile?.displayName ?? names.humans.name(author.userId);
}

/**
 * `#channel` for a mention or an inline reply to the viewer, `#channel › thread`
 * inside a Thread, null for a DM.
 */
export function needsYouPlace(row: NeedsYouRow): null | string {
    if (row.reason === 'dm') {
        return row.threadAnchorMessageId ? 'DM › thread' : null;
    }
    return row.threadAnchorMessageId ? `#${row.chatName} › thread` : `#${row.chatName}`;
}

/**
 * Where a row opens: the conversation itself, or the conversation with the
 * Thread open beside it. Replying there is what clears the row.
 */
export function needsYouConversationPath(slug: string, row: NeedsYouRow): string {
    return row.threadAnchorMessageId
        ? serverChatThreadRoute(slug, row.conversationChatId, row.threadAnchorMessageId)
        : serverChatRoute(slug, row.conversationChatId);
}

/** The Chats Conversations leaves out, so one conversation is never listed twice. */
export function needsYouChatIds(rows: readonly NeedsYouRow[]): ReadonlySet<string> {
    return new Set(rows.map((row) => row.chatId));
}

/** A platform notification's text: the author and the place, then what they said. */
export function needsYouNotificationText(view: NeedsYouRowView): { body: string; title: string } {
    return {
        body: view.preview,
        title: view.place ? `${view.authorName} in ${view.place}` : view.authorName,
    };
}
