export type HausRichReferenceKind =
    | 'agent'
    | 'app'
    | 'chat'
    | 'worker'
    | 'directory'
    | 'file'
    | 'image-generation'
    | 'plugin'
    | 'skill'
    | 'task'
    | 'user';

export type HausRichReferenceProjection =
    | 'agent-reference'
    | 'capability-reference'
    | 'chat-reference'
    | 'worker-reference'
    | 'image-generation-reference'
    | 'path-reference'
    | 'skill-activation'
    | 'task-reference'
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

/**
 * `chat://<chatId>?thread=<messageId>`: one Message in a Channel or DM. The
 * query key is the wire form stored bodies already carry from when the link
 * opened a side conversation on that Message (ADR 0053 folded those into
 * inline replies under it), so every stored link keeps opening its Message.
 */
export function formatChatMessageReferenceTarget(chatId: string, messageId: string) {
    return `${formatChatReferenceTarget(chatId)}?thread=${encodeReferenceId(messageId)}`;
}

/** `worker://<workId>`. Build whole links with `formatWorkerLink`. */
export function formatWorkerReferenceTarget(workId: string) {
    return `worker://${encodeReferenceId(workId)}`;
}

/** `image-generation://<generationId>`. Build whole links with `formatImageGenerationLink`. */
export function formatImageGenerationReferenceTarget(generationId: string) {
    return `image-generation://${encodeReferenceId(generationId)}`;
}

export function formatSkillReferenceTarget(skillId: string) {
    return `skill://${encodeReferenceId(skillId)}`;
}

/** `task://<taskId>`: a Task (ADR 0053). Agents write bare keys like `SEC-12` instead. */
export function formatTaskReferenceTarget(taskId: string) {
    return `task://${encodeReferenceId(taskId)}`;
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
    const message = parseChatMessageReferenceTarget(target);
    if (message) {
        return message.chatId;
    }
    if (target.includes('?')) {
        return null;
    }
    return parseSchemeReferenceTarget(target, 'chat');
}

/** The Message a `formatChatMessageReferenceTarget` link names, or null. */
export function parseChatMessageReferenceTarget(target: string) {
    const match = /^chat:\/\/([^?]+)\?thread=([^&?#]+)$/u.exec(target);
    const chatId = match ? decodeReferenceId(match[1]) : null;
    const messageId = match ? decodeReferenceId(match[2]) : null;
    return chatId && messageId ? { chatId, messageId } : null;
}

export function parseWorkerReferenceTarget(target: string) {
    return parseSchemeReferenceTarget(target, 'worker');
}

export function parseImageGenerationReferenceTarget(target: string) {
    return parseSchemeReferenceTarget(target, 'image-generation');
}

export function parseSkillReferenceTarget(target: string) {
    return parseSchemeReferenceTarget(target, 'skill');
}

export function parseTaskReferenceTarget(target: string) {
    return parseSchemeReferenceTarget(target, 'task');
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

    if (parseWorkerReferenceTarget(target)) {
        return {
            kind: 'worker',
            // Undo the label escapes `formatWorkerLink` writes.
            label: rawLabel.replace(/\\([\\[])/gu, '$1'),
            projection: 'worker-reference',
        };
    }

    if (parseImageGenerationReferenceTarget(target)) {
        return {
            kind: 'image-generation',
            label: rawLabel.replace(/\\([\\[])/gu, '$1'),
            projection: 'image-generation-reference',
        };
    }

    if (parseTaskReferenceTarget(target)) {
        return {
            kind: 'task',
            label: rawLabel,
            projection: 'task-reference',
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
