import { driveDeletedRetentionDays } from '@haus/api';
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

export function fullResetConfirmation(displayName: string) {
    return `Deletes ${displayName}'s memory, notes, skills and rules, then restores a starter MEMORY.md and the factory skills in a fresh session. You can restore any of them from Recently deleted in Drive for ${driveDeletedRetentionDays} days.`;
}
