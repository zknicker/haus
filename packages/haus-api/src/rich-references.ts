export type HausRichReferenceKind =
    | 'agent'
    | 'app'
    | 'chat'
    | 'cloud-agent-work'
    | 'directory'
    | 'file'
    | 'image-generation'
    | 'plugin'
    | 'skill'
    | 'user';

export type HausRichReferenceProjection =
    | 'agent-reference'
    | 'capability-reference'
    | 'chat-reference'
    | 'cloud-agent-work-reference'
    | 'image-generation-reference'
    | 'path-reference'
    | 'skill-activation'
    | 'user-reference';

export interface HausRichReference {
    end: number;
    id: string;
    kind: HausRichReferenceKind;
    label: string;
    projection: HausRichReferenceProjection;
    start: number;
    text: string;
}

export function formatAgentReferenceTarget(agentId: string) {
    return `agent://${encodeReferenceId(agentId)}`;
}

export function formatAppReferenceTarget(appId: string) {
    return `app://computer-use/${encodeReferenceId(appId)}`;
}

export function formatChatReferenceTarget(chatId: string) {
    return `chat://${encodeReferenceId(chatId)}`;
}

export function formatChatThreadReferenceTarget(chatId: string, anchorMessageId: string) {
    return `${formatChatReferenceTarget(chatId)}?thread=${encodeReferenceId(anchorMessageId)}`;
}

/** `cloud-agent://<workId>`. Build whole links with `formatCloudAgentWorkLink`. */
export function formatCloudAgentWorkReferenceTarget(workId: string) {
    return `cloud-agent://${encodeReferenceId(workId)}`;
}

/** `image-generation://<generationId>`. Build whole links with `formatImageGenerationLink`. */
export function formatImageGenerationReferenceTarget(generationId: string) {
    return `image-generation://${encodeReferenceId(generationId)}`;
}

export function formatSkillReferenceTarget(skillId: string) {
    return `skill://${encodeReferenceId(skillId)}`;
}

export function formatUserReferenceTarget(userId: string) {
    return `user://${encodeReferenceId(userId)}`;
}

export function parseAgentReferenceTarget(target: string) {
    return parseSchemeReferenceTarget(target, 'agent');
}

export function parseAppReferenceTarget(target: string) {
    if (!target.startsWith('app://computer-use/')) {
        return null;
    }

    return decodeReferenceId(target.slice('app://computer-use/'.length));
}

export function parseChatReferenceTarget(target: string) {
    const thread = parseChatThreadReferenceTarget(target);
    if (thread) {
        return thread.chatId;
    }
    if (target.includes('?')) {
        return null;
    }
    return parseSchemeReferenceTarget(target, 'chat');
}

export function parseChatThreadReferenceTarget(target: string) {
    const match = /^chat:\/\/([^?]+)\?thread=([^&?#]+)$/u.exec(target);
    if (!match) {
        return null;
    }
    const chatId = decodeReferenceId(match[1]);
    const anchorMessageId = decodeReferenceId(match[2]);
    return chatId && anchorMessageId ? { anchorMessageId, chatId } : null;
}

export function parseCloudAgentWorkReferenceTarget(target: string) {
    return parseSchemeReferenceTarget(target, 'cloud-agent');
}

export function parseImageGenerationReferenceTarget(target: string) {
    return parseSchemeReferenceTarget(target, 'image-generation');
}

export function parseSkillReferenceTarget(target: string) {
    return parseSchemeReferenceTarget(target, 'skill');
}

export function parseUserReferenceTarget(target: string) {
    return parseSchemeReferenceTarget(target, 'user');
}

export function parseHausRichReferences(content: string) {
    const references: HausRichReference[] = [];
    const linkPattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/gu;

    for (const match of content.matchAll(linkPattern)) {
        const text = match[0];
        const rawLabel = match[1];
        const target = match[2].trim();
        const start = match.index;

        if (
            typeof text !== 'string' ||
            typeof rawLabel !== 'string' ||
            typeof target !== 'string' ||
            start === undefined
        ) {
            continue;
        }

        const reference = parseRichReferenceLink({ rawLabel, target });

        if (!reference) {
            continue;
        }

        references.push({
            ...reference,
            end: start + text.length,
            id: target,
            start,
            text,
        });
    }

    return references;
}

function parseRichReferenceLink({
    rawLabel,
    target,
}: {
    rawLabel: string;
    target: string;
}): Omit<HausRichReference, 'end' | 'id' | 'start' | 'text'> | null {
    if (parseAgentReferenceTarget(target)) {
        return {
            kind: 'agent',
            label: stripReferenceLabelSigil(rawLabel),
            projection: 'agent-reference',
        };
    }

    if (parseUserReferenceTarget(target)) {
        return {
            kind: 'user',
            label: stripReferenceLabelSigil(rawLabel),
            projection: 'user-reference',
        };
    }

    if (parseChatReferenceTarget(target)) {
        return {
            kind: 'chat',
            label: stripReferenceLabelSigil(rawLabel, '#'),
            projection: 'chat-reference',
        };
    }

    if (parseCloudAgentWorkReferenceTarget(target)) {
        return {
            kind: 'cloud-agent-work',
            // Undo the label escapes `formatCloudAgentWorkLink` writes.
            label: rawLabel.replace(/\\([\\[])/gu, '$1'),
            projection: 'cloud-agent-work-reference',
        };
    }

    if (parseImageGenerationReferenceTarget(target)) {
        return {
            kind: 'image-generation',
            label: rawLabel.replace(/\\([\\[])/gu, '$1'),
            projection: 'image-generation-reference',
        };
    }

    if (target.startsWith('plugin://')) {
        return {
            kind: 'plugin',
            label: stripReferenceLabelSigil(rawLabel),
            projection: 'capability-reference',
        };
    }

    if (parseAppReferenceTarget(target)) {
        return {
            kind: 'app',
            label: stripReferenceLabelSigil(rawLabel),
            projection: 'capability-reference',
        };
    }

    if (parseSkillReferenceTarget(target)) {
        return {
            kind: 'skill',
            label: stripReferenceLabelSigil(rawLabel),
            projection: 'skill-activation',
        };
    }

    if (target.startsWith('/')) {
        return {
            kind: inferPathKind(target),
            label: stripReferenceLabelSigil(rawLabel),
            projection: 'path-reference',
        };
    }

    return null;
}

function parseSchemeReferenceTarget(target: string, scheme: string) {
    const prefix = `${scheme}://`;

    if (!target.startsWith(prefix)) {
        return null;
    }

    return decodeReferenceId(target.slice(prefix.length));
}

function encodeReferenceId(id: string) {
    return encodeURIComponent(id.trim());
}

function decodeReferenceId(value: string) {
    if (!value) {
        return null;
    }

    try {
        return decodeURIComponent(value);
    } catch {
        return null;
    }
}

function stripReferenceLabelSigil(label: string, sigils = '@$') {
    return label.replace(new RegExp(`^[${sigils}]`, 'u'), '');
}

function inferPathKind(target: string): Extract<HausRichReferenceKind, 'directory' | 'file'> {
    const finalSegment = target.split('/').filter(Boolean).at(-1) ?? '';

    if (/\.[A-Za-z0-9]+$/u.test(finalSegment)) {
        return 'file';
    }

    return 'directory';
}
