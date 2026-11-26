type ChatKind = 'captain' | 'channel' | 'dm' | 'task';

export function isFollowedChatKind(kind: ChatKind): kind is 'task' {
    return kind === 'task';
}
