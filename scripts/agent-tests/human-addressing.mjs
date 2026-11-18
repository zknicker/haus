// Evidence for scenarios where an Agent needs a human (ADR 0037). An Agent
// asks a person by @mentioning them or inline-replying to their message, and
// the human's inline reply wakes the Agent. These helpers stay pure so the
// gates are proven without a live stack.

/** The immutable link a resolved human mention serializes to. */
export function humanMentionLink(userId) {
    return `user://${encodeURIComponent(userId)}`;
}

/** True when message content carries a resolved mention of this human. */
export function mentionsHuman(content, userId) {
    return typeof content === 'string' && content.includes(`(${humanMentionLink(userId)})`);
}

/**
 * Why a message addresses this human, as the notification rule names it:
 * `mention` for a resolved mention (it wins when a message is both), `reply`
 * for an inline reply to a message the human wrote, else null.
 */
export function humanAddressingReason(message, userId) {
    if (mentionsHuman(message?.content, userId)) {
        return 'mention';
    }
    const parent = message?.reply?.parent?.author;
    return parent?.kind === 'human' && parent.userId === userId ? 'reply' : null;
}

/** Where the human answers so the asking Agent sees it: an inline reply to the question. */
export function answerPlacement({ channelId, questionId }) {
    return { chatId: channelId, answerChatId: channelId, replyToMessageId: questionId };
}

/** Reads the human's own identity off a message they just sent. */
export function humanAuthorId(message) {
    if (message?.author?.kind !== 'human') {
        throw new Error('Expected a message authored by the evaluating human.');
    }
    return message.author.userId;
}
