import {
    parseAgentReferenceTarget,
    parseChatReferenceTarget,
    parseChatThreadReferenceTarget,
    parseHausRichReferences,
    parseUserReferenceTarget,
} from '@haus/api';
import type { ThreadReferenceTarget } from './thread-reference-targets.ts';

export interface ParticipantReferenceTarget {
    handle: string;
    id: string;
}

export interface ChatReferenceTarget {
    id: string;
    name: string;
}

export function readExistingReferenceTargets(content: string | undefined) {
    const references = parseHausRichReferences(content ?? '');
    const agents = references.flatMap((reference) => {
        const id = parseAgentReferenceTarget(reference.id);
        return id ? [{ handle: reference.label, id }] : [];
    });
    const users = references.flatMap((reference) => {
        const id = parseUserReferenceTarget(reference.id);
        return id ? [{ handle: reference.label, id }] : [];
    });
    const channels = references.flatMap((reference) => {
        const id = parseChatReferenceTarget(reference.id);
        if (!id) {
            return [];
        }
        const thread = parseChatThreadReferenceTarget(reference.id);
        return [
            {
                id,
                name: thread
                    ? reference.label.replace(/ thread$/u, '').split(':')[0]
                    : reference.label,
            },
        ];
    });
    const threads: ThreadReferenceTarget[] = references.flatMap((reference) => {
        const thread = parseChatThreadReferenceTarget(reference.id);
        return thread
            ? [{ parentChatId: thread.chatId, anchorMessageId: thread.anchorMessageId }]
            : [];
    });
    return { agents, channels, users, threads };
}
