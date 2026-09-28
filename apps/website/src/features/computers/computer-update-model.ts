import type { ComputerUpdatePhase } from '@haus/api';
import { unconfirmedComputerUpdate } from '../updates/offline-computer-update.ts';

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

export function computerUpdateView(input: {
    health: 'degraded' | 'healthy' | 'offline' | 'update-required';
    isChecking?: boolean;
    observedAt?: number;
    phase: ComputerUpdatePhase;
    targetVersion?: string | null;
    updateUpdatedAt?: string | null;
}) {
    const unconfirmed = unconfirmedComputerUpdate(input, input.observedAt ?? Date.now());
    const connected = input.health !== 'offline';
    const updateInFlight = updateInFlightPhases.includes(input.phase);
    const busy = input.isChecking || input.phase === 'checking' || updateInFlight;
    return {
        canCheck: connected && !busy,
        canUpdate: connected && input.phase === 'available' && !busy,
        detail: unconfirmed?.detail ?? null,
        // Keep recent update progress visible through an expected disconnect.
        // An idle offline Computer has no update control to show.
        label: unconfirmed
            ? 'Update unconfirmed'
            : connected || updateInFlight
              ? input.isChecking
                  ? phaseLabels.checking
                  : input.phase === 'idle' && input.targetVersion
                    ? 'Up to date'
                    : phaseLabels[input.phase]
              : 'Unavailable while offline',
        needsLocalRecovery:
            input.health === 'update-required' ||
            (input.health === 'offline' && (input.phase !== 'restarting' || !!unconfirmed)),
        unconfirmed: unconfirmed !== null,
    };
}

export function computerUpdatePhaseLabel(phase: ComputerUpdatePhase) {
    return phaseLabels[phase];
}
