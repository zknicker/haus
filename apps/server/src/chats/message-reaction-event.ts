import { messageReactionUpdatedTopic } from '../realtime/topics.ts';

/** Prepares `message.reaction.updated` for a reaction change about to commit. */
export function prepareMessageReactionEvent(input: {
    chatId: string;
    messageId: string;
    serverId: string;
}) {
    return messageReactionUpdatedTopic.prepare({
        chatId: input.chatId,
        messageId: input.messageId,
        serverId: input.serverId,
    });
}
