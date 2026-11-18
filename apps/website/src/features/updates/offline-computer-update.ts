import type { ComputerUpdatePhase } from '@haus/api';
import { expectedComputerRestartMs } from './haus-update-timing.ts';

interface ComputerUpdateConnection {
    health: 'degraded' | 'healthy' | 'offline' | 'update-required';
    phase: ComputerUpdatePhase;
    updateUpdatedAt?: string | null;
}

const activePhases = new Set<ComputerUpdatePhase>([
    'requested',
    'downloading',
    'verifying',
    'waiting-for-agents',
    'installing',
    'restarting',
]);

export function offlineComputerUpdateExpiry(computer: ComputerUpdateConnection): number | null {
    if (computer.health !== 'offline' || !activePhases.has(computer.phase)) {
        return null;
    }
    return computer.updateUpdatedAt
        ? new Date(computer.updateUpdatedAt).getTime() + expectedComputerRestartMs
        : 0;
}

export function unconfirmedComputerUpdate(
    computer: ComputerUpdateConnection,
    observedAt: number
): { detail: string; failedPhase: ComputerUpdatePhase } | null {
    const expiry = offlineComputerUpdateExpiry(computer);
    if (expiry === null || observedAt < expiry) {
        return null;
    }
    return {
        detail:
            computer.phase === 'restarting'
                ? 'This Computer did not reconnect after installation. Reconnect it to confirm the installed version.'
                : 'This Computer disconnected during the update. Reconnect it to confirm whether the update finished.',
        failedPhase: computer.phase,
    };
}
