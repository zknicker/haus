import type { Agent, Chat, ChatMessage, MessageNotificationReason } from '@haus/api';
import { messagePreviewLine } from '../chats/message-preview-line.ts';
import type { HumanDirectory } from '../servers/human-identity.ts';
import { serverChatRoute } from '../servers/server-routes.ts';
import type { MessageNotificationText } from './message-notifier.ts';

export interface MessageNotificationNames {
    agents: readonly Agent[];
    chats: readonly Chat[];
    humans: HumanDirectory;
}

/**
 * A notification's text: the author, then where they wrote when it is not
 * their DM with you (`#channel`), and the message flattened to one line.
 * Pressing it opens the conversation.
 */
export function messageNotificationText(input: {
    chatId: string;
    message: Pick<ChatMessage, 'author' | 'content'>;
    names: MessageNotificationNames;
    reason: MessageNotificationReason;
    slug: string;
}): MessageNotificationText {
    const author = messageAuthorName(input.message, input.names);
    const place = messagePlace(input);
    return {
        body: messagePreviewLine(input.message.content),
        path: serverChatRoute(input.slug, input.chatId),
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
            agent?.displayName ??
            author.profile?.displayName ??
            `Captain ${author.agentId.slice(-6)}`
        );
    }
    return author.profile?.displayName ?? names.humans.name(author.userId);
}

/**
 * Null for a top-level DM message, or a Channel this reader's list cannot name. A Captain chat is
 * named by its Captain.
 */
function messagePlace(input: {
    chatId: string;
    names: Pick<MessageNotificationNames, 'agents' | 'chats'>;
    reason: MessageNotificationReason;
}): null | string {
    if (input.reason === 'dm') {
        return null;
    }
    const chat = input.names.chats.find((candidate) => candidate.id === input.chatId);
    if (chat?.kind === 'captain') {
        return (
            input.names.agents.find((agent) => agent.id === chat.peerAgentId)?.displayName ?? null
        );
    }
    return chat?.name ? `#${chat.name}` : null;
}
