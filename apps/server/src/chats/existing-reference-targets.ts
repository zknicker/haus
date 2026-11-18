import {
    parseAgentReferenceTarget,
    parseChatMessageReferenceTarget,
    parseChatReferenceTarget,
    parseHausRichReferences,
    parseUserReferenceTarget,
} from '@haus/api';

import type { MessageReferenceTarget } from './message-reference-targets.ts';

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
        const message = parseChatMessageReferenceTarget(reference.id);
        return [
            {
                id,
                name: message
                    ? reference.label.replace(/ (?:message|thread)$/u, '').split(':')[0]
                    : reference.label,
            },
        ];
    });
    const messages: MessageReferenceTarget[] = references.flatMap((reference) => {
        const message = parseChatMessageReferenceTarget(reference.id);
        return message ? [message] : [];
    });
    return { agents, channels, messages, users };
}
