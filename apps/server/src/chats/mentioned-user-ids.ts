import { parseHausRichReferences, parseUserReferenceTarget } from '@haus/api';

/**
 * The human user ids a Message's content addresses with `user://` mentions
 * (ADR 0037). One parse feeds `chat_messages.mentioned_user_ids` on every
 * send path and the Thread auto-follow of mentioned humans.
 */
export function mentionedUserIds(content: string): string[] {
    return [
        ...new Set(
            parseHausRichReferences(content).flatMap((reference) => {
                if (reference.kind !== 'user') {
                    return [];
                }
                const userId = parseUserReferenceTarget(reference.id);
                return userId ? [userId] : [];
            })
        ),
    ];
}
