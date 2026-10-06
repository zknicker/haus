import type { ComputerUpdatePhase } from '@haus/api';
import { unconfirmedComputerUpdate } from '../updates/offline-computer-update.ts';
import { stalledComputerUpdate } from '../updates/stalled-computer-update.ts';

const phaseLabels = {
    available: 'Update available',
    checking: 'Checking production release…',
    complete: 'Update complete',
    downloading: 'Downloading Haus Computer',
    failed: 'Update failed',
    idle: 'Not checked',
    installing: 'Installing update',
    requested: 'Download requested',
    restarting: 'Restarting Haus Computer',
    verifying: 'Verifying signature and integrity',
    'waiting-for-agents': 'Waiting for active Agents…',
} as const satisfies Record<ComputerUpdatePhase, string>;

const updateInFlightPhases: ComputerUpdatePhase[] = [
    'requested',
    'downloading',
    'verifying',
    'installing',
    'waiting-for-agents',
    'restarting',
];

interface ComputerUpdateInput {
    health: 'degraded' | 'healthy' | 'offline' | 'update-required';
    installedVersion?: string | null;
    isChecking?: boolean;
    observedAt?: number;
    phase: ComputerUpdatePhase;
    targetVersion?: string | null;
    updateUpdatedAt?: string | null;
}

export function computerUpdateView(input: ComputerUpdateInput) {
    const observedAt = input.observedAt ?? Date.now();
    const unconfirmed = unconfirmedComputerUpdate(input, observedAt);
    const stalled = stalledUpdate(input, observedAt);
    const connected = input.health !== 'offline';
    const updateInFlight = updateInFlightPhases.includes(input.phase) && !stalled;
    const busy = input.isChecking || (input.phase === 'checking' && !stalled) || updateInFlight;
    return {
        canCheck: connected && !busy,
        canUpdate: connected && (input.phase === 'available' || stalled !== null) && !busy,
        detail: unconfirmed?.detail ?? stalled?.detail ?? null,
        isUpdateActive: updateInFlight && !unconfirmed,
        label: unconfirmed
            ? 'Update unconfirmed'
            : stalled
              ? 'Update stalled'
              : phaseLabel(input, connected || updateInFlight),
        needsLocalRecovery:
            input.health === 'update-required' ||
            (input.health === 'offline' && (input.phase !== 'restarting' || !!unconfirmed)),
        stalled: stalled !== null,
        unconfirmed: unconfirmed !== null,
    };
}

export function computerUpdatePhaseLabel(phase: ComputerUpdatePhase) {
    return phaseLabels[phase];
}

/** A connected Computer that stopped reporting has stalled; the sidebar applies the same bound. */
function stalledUpdate(input: ComputerUpdateInput, observedAt: number) {
    const installedTarget = !!input.targetVersion && input.installedVersion === input.targetVersion;
    return installedTarget ? null : stalledComputerUpdate(input, observedAt);
}

/**
 * Keeps recent update progress visible through an expected disconnect. An idle
 * offline Computer has no update control to show.
 */
function phaseLabel(input: ComputerUpdateInput, visible: boolean) {
    if (!visible) {
        return 'Unavailable while offline';
    }
    if (input.isChecking) {
        return phaseLabels.checking;
    }
    return input.phase === 'idle' && input.targetVersion ? 'Up to date' : phaseLabels[input.phase];
}
