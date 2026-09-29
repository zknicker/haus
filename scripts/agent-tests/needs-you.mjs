// Needs you evidence for scenarios where an Agent needs a human (ADR 0037).
// An Agent asks a person by @mentioning them, inline-replying to their
// message, or answering in a Thread on it; the Server lists that exchange in the human's Inbox Needs you until
// they reply where the Agent will see it.
// These helpers stay pure so the gates are proven without a live stack.

/** The immutable link a resolved human mention serializes to. */
export function humanMentionLink(userId) {
    return `user://${encodeURIComponent(userId)}`;
}

/** True when message content carries a resolved mention of this human. */
export function mentionsHuman(content, userId) {
    return typeof content === 'string' && content.includes(`(${humanMentionLink(userId)})`);
}

/**
 * Why a message addresses this human, as the Server's row reason names it:
 * `mention` for a resolved mention (it wins when a message is both), `reply`
 * for an inline reply to a message the human wrote or any message in a Thread
 * anchored on one (pass that anchor's author), else null.
 */
export function humanAddressingReason(message, userId, threadAnchorAuthor = null) {
    if (mentionsHuman(message?.content, userId)) {
        return 'mention';
    }
    const parent = message?.reply?.parent?.author;
    if (parent?.kind === 'human' && parent.userId === userId) {
        return 'reply';
    }
    return threadAnchorAuthor?.kind === 'human' && threadAnchorAuthor.userId === userId
        ? 'reply'
        : null;
}

/** The one Needs you row for a Chat (a Thread's own Chat, or the Channel/DM). */
export function findNeedsYouRow(rows, chatId) {
    return rows.find((row) => row.chatId === chatId) ?? null;
}

/**
 * The row still owed for addressing the human already answered through
 * `answeredSequence`. A row whose newest addressing message is later is new
 * activity (the Agent mentioned them again), not an uncleared answer.
 */
export function staleNeedsYouRow(rows, chatId, answeredSequence) {
    const row = findNeedsYouRow(rows, chatId);
    return row && row.latest.sequence <= answeredSequence ? row : null;
}

/**
 * Where the human answers so the asking Agent sees it: inside the Thread the
 * question arrived in (any Thread, task or not), else as an inline reply to
 * the question itself.
 */
export function answerPlacement({ channelId, questionId, thread }) {
    if (thread) {
        return {
            chatId: channelId,
            needsYouChatId: thread.chatId,
            thread: { anchorMessageId: thread.anchorMessageId },
        };
    }
    return { chatId: channelId, needsYouChatId: channelId, replyToMessageId: questionId };
}

/** Reads the human's own identity off a message they just sent. */
export function humanAuthorId(message) {
    if (message?.author?.kind !== 'human') {
        throw new Error('Expected a message authored by the evaluating human.');
    }
    return message.author.userId;
}
