import type { Agent, Chat, ChatMessage, MessageNotificationReason } from '@haus/api';
import { messagePreviewLine } from '../chats/message-preview-line.ts';
import type { HumanDirectory } from '../servers/human-identity.ts';
import { serverChatRoute, serverChatThreadRoute } from '../servers/server-routes.ts';
import type { MessageNotificationText } from './message-notifier.ts';

export interface MessageNotificationNames {
    agents: readonly Agent[];
    chats: readonly Chat[];
    humans: HumanDirectory;
}

/**
 * A notification's text: the author, then where they wrote when it is not
 * their DM with you (`#channel`, `#channel › thread`, `DM › thread`), and the
 * message flattened to one line. Pressing it opens the conversation, with the
 * Thread beside it for a Thread message.
 */
export function messageNotificationText(input: {
    anchorMessageId: null | string;
    conversationChatId: string;
    message: Pick<ChatMessage, 'author' | 'content'>;
    names: MessageNotificationNames;
    reason: MessageNotificationReason;
    slug: string;
}): MessageNotificationText {
    const author = messageAuthorName(input.message, input.names);
    const place = messagePlace(input);
    return {
        body: messagePreviewLine(input.message.content),
        path: input.anchorMessageId
            ? serverChatThreadRoute(input.slug, input.conversationChatId, input.anchorMessageId)
            : serverChatRoute(input.slug, input.conversationChatId),
        title: place ? `${author} in ${place}` : author,
    };
}

/**
 * The live name first, then the name stored with the message, then a stable
 * id label — so a retired Agent or departed member still reads as someone.
 */
export function messageAuthorName(
    message: Pick<ChatMessage, 'author'>,
    names: Pick<MessageNotificationNames, 'agents' | 'humans'>
): string {
    const author = message.author;
    if (author.kind === 'agent') {
        const agent = names.agents.find((candidate) => candidate.id === author.agentId);
        return (
            agent?.displayName ?? author.profile?.displayName ?? `Agent ${author.agentId.slice(-6)}`
        );
    }
    return author.profile?.displayName ?? names.humans.name(author.userId);
}

/** Null for a top-level DM message, or a Channel this reader's list cannot name. */
function messagePlace(input: {
    anchorMessageId: null | string;
    conversationChatId: string;
    names: Pick<MessageNotificationNames, 'chats'>;
    reason: MessageNotificationReason;
}): null | string {
    const thread = input.anchorMessageId ? ' › thread' : '';
    if (input.reason === 'dm') {
        return thread ? `DM${thread}` : null;
    }
    const channel = input.names.chats.find((chat) => chat.id === input.conversationChatId);
    return channel?.name ? `#${channel.name}${thread}` : null;
}
