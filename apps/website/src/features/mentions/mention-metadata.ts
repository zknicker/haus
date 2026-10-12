import {
    parseAgentReferenceTarget,
    parseChatReferenceTarget,
    parseHausRichReferences,
    parseUserReferenceTarget,
} from '@haus/api/rich-references';
import { normalizeMentions } from './mention-text.ts';
import type { Mention } from './mention-types.ts';

export function readMentionsFromMarkdown(content: string) {
    return normalizeMentions(
        content,
        parseHausRichReferences(content).map((reference) => ({ ...reference }))
    );
}

/**
 * Mentions are re-read from the message text on every render, so identity says
 * nothing. Rendering surfaces compare them by value to decide whether a
 * re-parse actually changed anything.
 */
export function areMentionsEqual(
    previous: readonly Mention[] | undefined,
    next: readonly Mention[] | undefined
) {
    if (previous === next) {
        return true;
    }

    const left = previous ?? noMentions;
    const right = next ?? noMentions;

    return (
        left.length === right.length &&
        left.every((mention, index) => isSameMention(mention, right[index]))
    );
}

const noMentions: readonly Mention[] = [];

function isSameMention(previous: Mention, next: Mention | undefined) {
    return Boolean(
        next &&
            previous.end === next.end &&
            previous.id === next.id &&
            previous.kind === next.kind &&
            previous.label === next.label &&
            previous.projection === next.projection &&
            previous.start === next.start &&
            previous.text === next.text &&
            isSameMentionMetadata(previous.metadata, next.metadata)
    );
}

function isSameMentionMetadata(
    previous: Record<string, unknown> | undefined,
    next: Record<string, unknown> | undefined
) {
    if (previous === next) {
        return true;
    }

    if (!(previous && next)) {
        return false;
    }

    const keys = Object.keys(previous);

    return (
        keys.length === Object.keys(next).length && keys.every((key) => previous[key] === next[key])
    );
}

export interface AgentMentionAppearance {
    avatarUrl: string | null;
    displayName: string | null;
    primaryColor: string | null;
}

// Saved messages carry no appearance metadata (content is the source of
// truth), so transcript surfaces resolve each agent mention's display name,
// avatar, and color live from the agent record before rendering chips.
export function applyAgentMentionAppearance(
    mentions: readonly Mention[],
    lookupAgentAppearance: (agentId: string | null | undefined) => AgentMentionAppearance
): Mention[] {
    return mentions.map((mention) => {
        if (mention.kind !== 'agent') {
            return mention;
        }

        const agentId = parseAgentReferenceTarget(mention.id);
        const appearance = lookupAgentAppearance(agentId);

        if (
            appearance.avatarUrl === null &&
            appearance.displayName === null &&
            appearance.primaryColor === null
        ) {
            return mention;
        }

        return {
            ...mention,
            metadata: {
                ...mention.metadata,
                agentAvatarUrl: appearance.avatarUrl,
                agentColor: appearance.primaryColor,
                ...(appearance.displayName ? { agentDisplayName: appearance.displayName } : {}),
            },
        };
    });
}

export interface ChatMentionAppearance {
    color: string | null;
    icon: string | null;
}

export function applyChatMentionAppearance(
    mentions: readonly Mention[],
    lookupChatAppearance: (chatId: string | null | undefined) => ChatMentionAppearance
): Mention[] {
    return mentions.map((mention) => {
        if (mention.kind !== 'chat') {
            return mention;
        }

        const appearance = lookupChatAppearance(parseChatReferenceTarget(mention.id));

        return {
            ...mention,
            metadata: {
                ...mention.metadata,
                chatColor: appearance.color,
                chatIcon: appearance.icon,
            },
        };
    });
}

export function applyHumanMentionAppearance(
    mentions: readonly Mention[],
    lookupHuman: (userId: string | null | undefined) => {
        avatarUrl: string | null;
        displayName: string | null;
    }
): Mention[] {
    return mentions.map((mention) => {
        if (mention.kind !== 'user') {
            return mention;
        }

        const human = lookupHuman(parseUserReferenceTarget(mention.id));
        if (!human.displayName) {
            return mention;
        }

        return {
            ...mention,
            metadata: {
                ...mention.metadata,
                userAvatarUrl: human.avatarUrl,
                userDisplayName: human.displayName,
            },
        };
    });
}
