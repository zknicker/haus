/**
 * Who a new message notifies (ADR 0038). One rule, owned here so iPhone push
 * on the Server and desktop/web notifications in the App read the same facts
 * the same way and cannot drift.
 *
 * A human is notified about a message they did not write when it is in a DM
 * they belong to — every message — or, in a Channel or Task, when it
 * @mentions them or inline-replies to their message. Notifications are
 * decoupled from the Inbox: the Inbox is unread state, and reading a Chat
 * clears it without touching this rule.
 *
 * The caller owns access: the rule assumes the human can see the Chat. A DM
 * is only visible to its members, so a DM message seen by a human is theirs.
 */
export const messageNotificationReasons = ['dm', 'mention', 'reply'] as const;

export type MessageNotificationReason = (typeof messageNotificationReasons)[number];

/** The addressing facts `message.created` carries for a new message. */
export interface MessageNotificationFacts {
    authorUserId: string | null;
    conversationKind: 'channel' | 'dm';
    mentionedUserIds: readonly string[];
    /** The human author of the message this one inline-replies to. */
    replyToAuthorUserId: string | null;
}

/**
 * Why `message` notifies `userId`, or null when it does not. A DM is always
 * `dm`; elsewhere a mention wins over a reply when one message is both.
 */
export function messageNotificationReason(
    message: MessageNotificationFacts,
    userId: string
): MessageNotificationReason | null {
    if (message.authorUserId === userId) {
        return null;
    }
    if (message.conversationKind === 'dm') {
        return 'dm';
    }
    if (message.mentionedUserIds.includes(userId)) {
        return 'mention';
    }
    if (message.replyToAuthorUserId === userId) {
        return 'reply';
    }
    return null;
}

/**
 * The humans named by a message's addressing facts who it may notify, before
 * access is checked. DM members are not named on the message; the Server adds
 * them from the DM itself.
 */
export function messageNotificationCandidates(message: MessageNotificationFacts): string[] {
    const named = new Set([
        ...message.mentionedUserIds,
        ...(message.replyToAuthorUserId ? [message.replyToAuthorUserId] : []),
    ]);
    return [...named].filter((userId) => messageNotificationReason(message, userId) !== null);
}
