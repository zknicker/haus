import type { ComputerUpdatePhase } from '@haus/api';
import type { ComputerHealth } from '../postgres/schema/computers.ts';
import type { ComputerConnections } from './connections.ts';

/** A Server-requested update phase the Computer never advanced is failed after this long. */
export const unansweredUpdateTimeoutMs = 2 * 60_000;

interface StoredComputerPresence {
    health: ComputerHealth;
    id: string;
    updateDetail: string | null;
    updateFailedPhase: Exclude<ComputerUpdatePhase, 'failed'> | null;
    updatePhase: ComputerUpdatePhase;
    updateUpdatedAt: Date | null;
}

/**
 * Presents a stored Computer row as the App should see it. The live attachment
 * registry is the truth for connectivity: a persisted `health` can outlive its
 * socket. A `requested` or `checking` update with no Computer progress for
 * {@link unansweredUpdateTimeoutMs} is reported failed so it never reads as
 * updating forever.
 */
export function presentComputer<T extends StoredComputerPresence>(
    computer: T,
    connections: ComputerConnections,
    now: Date = new Date()
): T {
    const health = connections.hasAttachment(computer.id) ? computer.health : 'offline';
    if (!isUnansweredUpdate(computer, now)) {
        return { ...computer, health };
    }
    return {
        ...computer,
        health,
        updateDetail:
            computer.updatePhase === 'checking'
                ? 'The update check did not finish. Try again.'
                : 'Haus Computer did not respond to the update request. Reconnect it and try again.',
        updateFailedPhase: computer.updatePhase,
        updatePhase: 'failed',
    };
}

function isUnansweredUpdate(computer: StoredComputerPresence, now: Date) {
    if (computer.updatePhase !== 'requested' && computer.updatePhase !== 'checking') {
        return false;
    }
    if (!computer.updateUpdatedAt) {
        return true;
    }
    return now.getTime() - computer.updateUpdatedAt.getTime() >= unansweredUpdateTimeoutMs;
}
