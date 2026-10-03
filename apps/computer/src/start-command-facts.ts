import type { AgentStartCommand } from './agent-commands.ts';

const agentFactFields = [
    'agentDescription',
    'agentName',
    'agentPersonality',
    'homeTimezone',
] as const satisfies readonly (keyof AgentStartCommand)[];

type AgentFacts = Pick<AgentStartCommand, (typeof agentFactFields)[number]>;

/**
 * The Server-owned Agent facts a start frame may carry for the system prompt. Each is optional
 * and a string when present; one malformed fact rejects the whole frame (null).
 */
export function parseStartAgentFacts(frame: Record<string, unknown>): AgentFacts | null {
    const facts: AgentFacts = {};
    for (const field of agentFactFields) {
        const value = frame[field];
        if (value === undefined) {
            continue;
        }
        if (typeof value !== 'string') {
            return null;
        }
        facts[field] = value;
    }
    return facts;
}
