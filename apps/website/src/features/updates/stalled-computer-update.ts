import type { ComputerUpdatePhase } from '@haus/api';
import { expectedComputerRestartMs } from './haus-update-timing.ts';

interface ComputerUpdateProgress {
    health: 'degraded' | 'healthy' | 'offline' | 'update-required';
    phase: ComputerUpdatePhase;
    updateUpdatedAt?: string | null;
}

const reportingPhases = new Set<ComputerUpdatePhase>([
    'checking',
    'requested',
    'downloading',
    'verifying',
    'waiting-for-agents',
    'installing',
    'restarting',
]);

export function isReportedComputerUpdatePhase(phase: string) {
    return (reportingPhases as ReadonlySet<string>).has(phase);
}

/**
 * A connected Computer republishes progress throughout an update, including every
 * poll while it waits for Agents. Active work with no report for the restart bound
 * has stalled; offline Computers use `offline-computer-update.ts` instead.
 */
export function stalledComputerUpdateExpiry(computer: ComputerUpdateProgress): number | null {
    if (computer.health === 'offline' || !isReportedComputerUpdatePhase(computer.phase)) {
        return null;
    }
    return computer.updateUpdatedAt
        ? new Date(computer.updateUpdatedAt).getTime() + expectedComputerRestartMs
        : 0;
}

export function stalledComputerUpdate(
    computer: ComputerUpdateProgress,
    observedAt: number
): { detail: string; failedPhase: ComputerUpdatePhase } | null {
    const expiry = stalledComputerUpdateExpiry(computer);
    if (expiry === null || observedAt < expiry) {
        return null;
    }
    return { detail: stalledDetail(computer.phase), failedPhase: computer.phase };
}

function stalledDetail(phase: ComputerUpdatePhase) {
    switch (phase) {
        case 'checking':
            return 'The update check did not finish.';
        case 'requested':
            return 'This Computer did not respond to the update request.';
        default:
            return 'This Computer stopped reporting update progress.';
    }
}
