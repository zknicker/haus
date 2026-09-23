import type { Agent, ChatEngagement } from '@haus/api';

export interface ChatTypist {
    agentId: string;
    avatarUrl: string | null;
    displayName: string;
}

/**
 * One typist per engaged Agent, in engagement order. An Agent the roster does
 * not know yet is left out rather than named generically.
 */
export function resolveChatTypists(
    engagements: readonly ChatEngagement[],
    agents: readonly Pick<Agent, 'avatarUrl' | 'displayName' | 'id'>[]
): ChatTypist[] {
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const typists = new Map<string, ChatTypist>();
    for (const engagement of engagements) {
        const agent = agentById.get(engagement.agentId);
        if (agent && !typists.has(agent.id)) {
            typists.set(agent.id, {
                agentId: agent.id,
                avatarUrl: agent.avatarUrl,
                displayName: agent.displayName,
            });
        }
    }
    return [...typists.values()];
}

/**
 * "Juniper is typing", "Juniper and Cove are typing", and from three on
 * "Juniper, Cove, and 2 others are typing". The dots after it are the ellipsis.
 */
export function formatChatTypingLabel(names: readonly string[]): string | null {
    const [first, second] = names;
    if (first === undefined) {
        return null;
    }
    if (second === undefined) {
        return `${first} is typing`;
    }
    if (names.length === 2) {
        return `${first} and ${second} are typing`;
    }
    const others = names.length - 2;
    return `${first}, ${second}, and ${others} ${others === 1 ? 'other' : 'others'} are typing`;
}
