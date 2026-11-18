import { formatAgentReferenceTarget } from '@haus/api/rich-references';
import type { MentionOption } from './mention-types.ts';

export function buildAgentMentionOption({
    agentId,
    agents,
}: {
    agentId: string;
    agents: MentionAgent[];
}): MentionOption {
    const agent = agents.find((entry) => entry.id === agentId);
    const label = agent?.name ?? agentId;
    const avatarUrl = agent?.avatarUrl ?? null;
    const primaryColor = agent?.effectivePrimaryColor ?? null;

    return {
        description: 'Agent in this chat',
        id: formatAgentReferenceTarget(agentId),
        insertText: label.startsWith('@') ? label : `@${label}`,
        kind: 'agent',
        label,
        metadata:
            avatarUrl || primaryColor
                ? { agentAvatarUrl: avatarUrl, agentColor: primaryColor }
                : undefined,
        projection: 'agent-reference',
        sourceLabel: 'Agents',
    };
}

export interface MentionAgent {
    avatarUrl?: string | null;
    effectivePrimaryColor?: string | null;
    id: string;
    name: string;
}

export function selectMentionOptionsForQuery({
    agents = [],
    inventoryData,
    mentionableAgentIds = [],
    pathData,
    query,
}: {
    agents?: MentionAgent[];
    inventoryData?: { options: MentionOption[] };
    mentionableAgentIds?: readonly string[];
    pathData?: { options: MentionOption[]; query: string };
    query: string;
}) {
    const agentOptions = filterMentionOptionsForQuery(
        mentionableAgentIds.map((agentId) => buildAgentMentionOption({ agentId, agents })),
        query
    );
    const inventoryOptions = inventoryData
        ? filterMentionOptionsForQuery(inventoryData.options, query)
        : [];
    const pathOptions =
        pathData && normalizeMentionQuery(pathData.query) === normalizeMentionQuery(query)
            ? pathData.options
            : [];

    return [...agentOptions, ...inventoryOptions, ...pathOptions];
}

export function filterMentionOptionsForQuery(options: MentionOption[], query: string) {
    const normalizedQuery = normalizeMentionQuery(query);

    if (!normalizedQuery) {
        return options;
    }

    return options.filter((option) =>
        normalizeMentionQuery(
            [option.label, option.insertText, option.id, option.description, option.sourceLabel]
                .filter(Boolean)
                .join(' ')
        ).includes(normalizedQuery)
    );
}

export function normalizeMentionQuery(value: string) {
    return value.trim().toLowerCase();
}
