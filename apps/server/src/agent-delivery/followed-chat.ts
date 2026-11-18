type ChatKind = 'channel' | 'dm' | 'task';

/**
 * A Chat that delivers only to its followers and mentioned Agents: a Task's
 * own Chat (ADR 0053 decision 9). Channels and DMs deliver to their members.
 */
export function isFollowedChatKind(kind: ChatKind): kind is 'task' {
    return kind === 'task';
}
