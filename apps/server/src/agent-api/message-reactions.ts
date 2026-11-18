import type { HausAgentMessage } from '@haus/api';
import { readChatMessageReactions } from '../chats/message-reactions.ts';
import type { HausDatabase } from '../postgres/connection.ts';

type AgentMessageReaction = NonNullable<HausAgentMessage['reactions']>[number];

/** Projects the shared Chat reaction relation into the Agent API's stable shape. */
export async function readMessageReactions(
    db: HausDatabase,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, AgentMessageReaction[]>> {
    const reactionsByMessage = await readChatMessageReactions(db, serverId, messageIds);
    return new Map(
        [...reactionsByMessage].map(([messageId, reactions]) => [
            messageId,
            reactions.map(({ actors, emoji }) => ({
                actors: actors.map(({ handle, id }) => ({ handle, id })),
                emoji,
            })),
        ])
    );
}
