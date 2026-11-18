import type { Agent } from '@haus/api';
import type { ServerDetail } from '../../../lib/haus-server.tsx';

/**
 * The lifecycle verbs the profile header offers, ordered by how much they
 * disturb the Agent: halt the current run, restart the process, drop its
 * context, rebuild it from factory state, then destroy the Agent.
 */
export const agentActions = ['stop', 'restart', 'fresh-session', 'full-reset', 'delete'] as const;

export type AgentAction = (typeof agentActions)[number];

/** Every verb here interrupts or destroys, so a Member gets no menu at all. */
export function canRunAgentActions(role: ServerDetail['role']): boolean {
    return role === 'admin' || role === 'owner';
}

/**
 * Stop is the one verb that needs something to stop. While any lifecycle
 * mutation is in flight the whole menu is inert, because two of these racing
 * would leave the Agent in a state neither one asked for.
 */
export function disabledAgentActions(input: {
    isPending: boolean;
    isRunning: boolean;
}): AgentAction[] {
    if (input.isPending) {
        return [...agentActions];
    }
    return input.isRunning ? [] : ['stop'];
}

export function fullResetCopy(factoryKind: Agent['factoryKind']) {
    if (factoryKind === 'cove') {
        return {
            confirmation:
                "This starts a fresh session and permanently wipes Cove's workspace, MEMORY.md, skills, and runtime-local state. Cove's factory onboarding workspace and factory-managed skills are restored. Identity, Chat history, model configuration, and connections are kept.",
            description:
                "Start fresh and restore Cove's factory onboarding workspace and factory-managed skills.",
        };
    }
    return {
        confirmation:
            "This starts a fresh session and permanently wipes the Agent's workspace, MEMORY.md, skills, and runtime-local state. A minimal MEMORY.md and factory-managed skills are restored. Identity, Chat history, model configuration, and connections are kept.",
        description: 'Start fresh and restore a minimal MEMORY.md and factory-managed skills.',
    };
}
