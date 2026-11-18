import { parseAgentReferenceTarget } from '@haus/api/rich-references';
import * as React from 'react';
import { areMentionsEqual } from './mention-metadata.ts';
import type { ActiveMentionQuery, Mention } from './mention-types.ts';

export interface MentionComposerScaffold {
    activeQuery: ActiveMentionQuery | null;
    mentions: Mention[];
    setActiveQuery: React.Dispatch<React.SetStateAction<ActiveMentionQuery | null>>;
    setMentions: React.Dispatch<React.SetStateAction<Mention[]>>;
    skillScopeAgentIds: string[];
}

export function useMentionComposerScaffold({
    agentId,
    initialMentions = [],
    mentionableAgentIds,
}: {
    agentId: string;
    initialMentions?: readonly Mention[];
    mentionableAgentIds: readonly string[];
}): MentionComposerScaffold {
    const [mentions, setMentions] = React.useState<Mention[]>(() => [...initialMentions]);
    const [activeQuery, setActiveQuery] = React.useState<ActiveMentionQuery | null>(null);
    React.useEffect(() => {
        if (!areMentionsEqual(mentions, initialMentions)) {
            setMentions([...initialMentions]);
        }
    }, [initialMentions, mentions]);
    // The editor emits a fresh `mentions` array on every keystroke, so an
    // identity-keyed memo here produces a new scope array per render and
    // invalidates every downstream query input and prefetch callback. Key the
    // memo on the resolved scope value instead.
    const skillScopeAgentIdsKey = resolveSkillScopeAgentIdsKey({
        agentId,
        mentionableAgentIds,
        mentions,
    });
    const skillScopeAgentIds = React.useMemo(
        () =>
            skillScopeAgentIdsKey === '' ? [] : skillScopeAgentIdsKey.split(SCOPE_KEY_SEPARATOR),
        [skillScopeAgentIdsKey]
    );

    return {
        activeQuery,
        mentions,
        setActiveQuery,
        setMentions,
        skillScopeAgentIds,
    };
}

export function resolveSkillScopeAgentIds({
    agentId,
    mentionableAgentIds = [],
    mentions,
}: {
    agentId: string;
    mentionableAgentIds?: readonly string[];
    mentions: readonly Mention[];
}) {
    const mentionable = new Set(mentionableAgentIds);
    const taggedAgentIds = mentions.flatMap((mention) => {
        if (mention.kind !== 'agent' || mention.projection !== 'agent-reference') {
            return [];
        }

        const parsed = parseAgentReferenceTarget(mention.id);
        if (!parsed) {
            return [];
        }

        if (mentionable.size > 0 && !mentionable.has(parsed)) {
            return [];
        }

        return [parsed];
    });
    const fallbackAgentIds = mentionableAgentIds.length > 0 ? mentionableAgentIds : [agentId];
    const scopedAgentIds = taggedAgentIds.length > 0 ? taggedAgentIds : fallbackAgentIds;

    return [...new Set(scopedAgentIds.map((id) => id.trim()).filter(Boolean))];
}

const SCOPE_KEY_SEPARATOR = '\n';

/**
 * Value key for the resolved skill scope. Two renders that resolve the same
 * agent ids produce the same key, which keeps the scope array, query inputs,
 * and prefetch callbacks referentially stable across unrelated re-renders.
 */
export function resolveSkillScopeAgentIdsKey(params: {
    agentId: string;
    mentionableAgentIds?: readonly string[];
    mentions: readonly Mention[];
}) {
    return resolveSkillScopeAgentIds(params).join(SCOPE_KEY_SEPARATOR);
}
