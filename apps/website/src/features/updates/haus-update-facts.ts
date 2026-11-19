import type {
    ComputerUpdateStep,
    DesktopUpdateStep,
    HausComponentFact,
    HausUpdateInput,
} from './haus-update-contract.ts';

const activePhases = new Set([
    'checking',
    'downloading',
    'installing',
    'requested',
    'restarting',
    'verifying',
    'waiting-for-agents',
]);

export function projectComponentFacts(
    input: HausUpdateInput,
    computers: readonly ComputerUpdateStep[],
    desktop: DesktopUpdateStep | null
): HausComponentFact[] {
    const desktopTarget = input.release.components.desktopApp;
    const facts: HausComponentFact[] = [];
    if (input.desktop.kind === 'desktop') {
        facts.push({
            currentVersion: desktop?.currentVersion ?? input.desktop.currentVersion,
            detail: desktop?.phase === 'failed' ? desktop.detail : null,
            id: 'desktop-app',
            kind: 'desktop-app',
            label: 'Haus App',
            remedy:
                desktop?.phase === 'failed'
                    ? 'Try again. If the problem continues, restart Haus App.'
                    : null,
            status: desktop && desktopTarget ? statusForStep(desktop) : 'external',
            targetVersion: desktopTarget,
        });
    }
    facts.push(...computers.map(computerFact));
    return facts;
}

function computerFact(step: ComputerUpdateStep): HausComponentFact {
    return {
        currentVersion: step.currentVersion,
        detail: step.phase === 'failed' ? step.detail : null,
        id: step.id,
        kind: 'computer',
        label: step.label,
        remedy: step.phase === 'failed' ? computerFailureRemedy(step.failedPhase) : null,
        status: statusForStep(step),
        targetVersion: step.targetVersion,
    };
}

function statusForStep(step: ComputerUpdateStep | DesktopUpdateStep): HausComponentFact['status'] {
    if (step.phase === 'current') {
        return 'current';
    }
    if (step.phase === 'failed') {
        return 'failed';
    }
    return activePhases.has(step.phase) || step.phase === 'restart-required'
        ? 'updating'
        : 'pending';
}

function computerFailureRemedy(failedPhase: string | null) {
    if (failedPhase === 'waiting-for-agents') {
        return 'Finish or stop active Captain work, then try again.';
    }
    if (failedPhase === 'restarting' || failedPhase === 'installing') {
        return 'Open this device in Settings for recovery steps.';
    }
    return 'Check this device’s connection, then try again.';
}
