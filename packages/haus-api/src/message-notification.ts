/**
 * Who a new message notifies (ADR 0038). One rule, owned here so iPhone push
 * on the Server and desktop/web notifications in the App read the same facts
 * the same way and cannot drift.
 *
 * A human is notified about a message they did not write when it is in a DM
 * they belong to — every message — or, in a Channel or Task, when it
 * @mentions them or inline-replies to their message, or sits in a Task that
 * started from their message. Notifications are
 * decoupled from the Inbox: the Inbox is unread state, and reading a Chat
 * clears it without touching this rule.
 *
 * The caller owns access: the rule assumes the human can see the Chat. A DM
 * is only visible to its members, so a DM message seen by a human is theirs.
 * A Captain chat is visible to everyone, so only its subscribed members hear
 * every message (`subscribed`); the Server adds them from the chat itself.
 */
export const messageNotificationReasons = ['dm', 'mention', 'reply', 'subscribed'] as const;

export type MessageNotificationReason = (typeof messageNotificationReasons)[number];

/** The addressing facts `message.created` carries for a new message. */
export interface MessageNotificationFacts {
    authorUserId: string | null;
    conversationKind: 'channel' | 'dm' | 'captain';
    mentionedUserIds: readonly string[];
    /** The human author of the message this one inline-replies to. */
    replyToAuthorUserId: string | null;
    /** The human author of the origin Message of the Task this message is in. */
    taskOriginAuthorUserId: string | null;
}

/**
 * Why `message` notifies `userId`, or null when it does not. A DM is always
 * `dm`; elsewhere a mention wins over a reply when one message is both, and
 * either wins over `subscribed`, which only a Captain chat's subscribed member
 * (`viewer.subscribed`) hears.
 */
export function messageNotificationReason(
    message: MessageNotificationFacts,
    userId: string,
    viewer: { subscribed?: boolean } = {}
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
    if (message.replyToAuthorUserId === userId || message.taskOriginAuthorUserId === userId) {
        return 'reply';
    }
    return message.conversationKind === 'captain' && viewer.subscribed ? 'subscribed' : null;
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
        ...(message.taskOriginAuthorUserId ? [message.taskOriginAuthorUserId] : []),
    ]);
    return [...named].filter((userId) => messageNotificationReason(message, userId) !== null);
}
