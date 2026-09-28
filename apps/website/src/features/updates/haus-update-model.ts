import type {
    ComputerUpdateStep,
    DesktopUpdateStep,
    HausUpdateComputer,
    HausUpdateComputerPhase,
    HausUpdateDesktop,
    HausUpdateInput,
    HausUpdatePhase,
    HausUpdateStep,
    HausUpdateView,
} from './haus-update-contract.ts';
import { projectComponentFacts } from './haus-update-facts.ts';
import {
    offlineComputerUpdateExpiry,
    unconfirmedComputerUpdate,
} from './offline-computer-update.ts';

export type {
    ComputerUpdateStep,
    DesktopUpdateStep,
    HausComponentFact,
    HausReleaseSnapshot,
    HausUpdateComputer,
    HausUpdateComputerPhase,
    HausUpdateDesktop,
    HausUpdateInput,
    HausUpdatePhase,
    HausUpdateStep,
    HausUpdateView,
} from './haus-update-contract.ts';

const activeComputerPhases = new Set<HausUpdateComputerPhase>([
    'checking',
    'downloading',
    'installing',
    'requested',
    'restarting',
    'verifying',
    'waiting-for-agents',
]);

export function projectHausUpdate(input: HausUpdateInput): HausUpdateView {
    const observedAt = input.observedAt ?? Date.now();
    const computerTarget = input.release.components.computer;
    const projectedComputerSteps = computerTarget
        ? input.computers
              .map((computer) => projectComputerStep(computer, computerTarget, observedAt))
              .filter((step): step is ComputerUpdateStep => step !== null)
        : [];
    const computerSteps = projectedComputerSteps
        .map((step) => ({ ...step, label: `Computer · ${step.label}` }))
        .sort(compareComputerSteps);
    const desktopStep = projectDesktopStep(input.desktop, input.release.components.desktopApp);
    const steps = desktopStep ? [...computerSteps, desktopStep] : computerSteps;
    const phase = aggregatePhase(steps);

    return {
        componentFacts: projectComponentFacts(input, computerSteps, desktopStep),
        detail: aggregateDetail(phase, steps),
        headline: aggregateHeadline(phase, input.release.version),
        phase,
        primaryAction: primaryAction(phase, steps),
        steps,
        version: input.release.version,
    };
}

export function isCompleteUpdateStep(step: HausUpdateStep) {
    return step.phase === 'current';
}

export function isActiveUpdateStep(step: HausUpdateStep) {
    return step.kind === 'computer'
        ? step.phase !== 'current' && activeComputerPhases.has(step.phase)
        : ['checking', 'downloading', 'restarting'].includes(step.phase);
}

function projectComputerStep(
    computer: HausUpdateComputer,
    targetVersion: string,
    observedAt: number
): ComputerUpdateStep | null {
    const unconfirmed = unconfirmedComputerUpdate(computer, observedAt);
    if (
        computer.health === 'offline' &&
        (offlineComputerUpdateExpiry(computer) === null ||
            computer.reportedTargetVersion !== targetVersion)
    ) {
        return null;
    }
    const current = isVersionCurrent(computer.currentVersion, targetVersion);
    const phase = unconfirmed
        ? 'failed'
        : current
          ? 'current'
          : normalizeComputerPhase(computer, targetVersion);
    return {
        connected: computer.health !== 'offline',
        currentVersion: computer.currentVersion,
        detail: unconfirmed?.detail ?? computer.detail ?? null,
        failedPhase: unconfirmed?.failedPhase ?? computer.failedPhase ?? null,
        id: computer.id,
        kind: 'computer',
        label: computer.name,
        phase,
        progress: computer.progress ?? null,
        targetVersion,
    };
}

function normalizeComputerPhase(
    computer: HausUpdateComputer,
    targetVersion: string
): ComputerUpdateStep['phase'] {
    if (activeComputerPhases.has(computer.phase)) {
        return computer.phase;
    }
    if (computer.phase === 'failed' && computer.reportedTargetVersion === targetVersion) {
        return 'failed';
    }
    return 'available';
}

function projectDesktopStep(
    desktop: HausUpdateDesktop,
    targetVersion: string | null
): DesktopUpdateStep | null {
    if (desktop.kind === 'web') {
        return null;
    }
    if (!targetVersion) {
        return null;
    }
    const phase = isVersionCurrent(desktop.currentVersion, targetVersion)
        ? 'current'
        : desktop.phase === 'error'
          ? 'failed'
          : desktop.phase === 'ready'
            ? 'restart-required'
            : desktop.phase === 'idle' || desktop.phase === 'current'
              ? 'pending'
              : desktop.phase;
    return {
        currentVersion: desktop.currentVersion,
        detail: desktop.detail ?? null,
        id: 'desktop-app',
        kind: 'desktop-app',
        label: 'Haus App',
        phase,
        progress: desktop.progress ?? null,
        targetVersion,
    };
}

function aggregatePhase(steps: readonly HausUpdateStep[]): HausUpdatePhase {
    if (steps.some(isActiveUpdateStep)) {
        return 'updating';
    }
    if (steps.some((step) => step.phase === 'restart-required')) {
        return 'restart-required';
    }
    if (steps.some((step) => step.phase === 'failed' && isConnectedStep(step))) {
        return 'failed';
    }
    if (steps.some((step) => step.phase !== 'failed' && !isCompleteUpdateStep(step))) {
        return 'available';
    }
    if (steps.some((step) => step.phase === 'failed')) {
        return 'failed';
    }
    return 'current';
}

function aggregateHeadline(phase: HausUpdatePhase, version: string) {
    switch (phase) {
        case 'current':
            return `Haus ${version}`;
        case 'available':
            return `Haus ${version} is ready`;
        case 'updating':
            return `Updating Haus ${version}`;
        case 'restart-required':
            return 'Restart to finish';
        case 'reload-required':
            return 'Update available. Reload Haus.';
        case 'failed':
            return 'Update needs attention';
    }
}

function aggregateDetail(phase: HausUpdatePhase, steps: readonly HausUpdateStep[]) {
    const remaining = steps.filter((step) => isConnectedStep(step) && !isCompleteUpdateStep(step));
    const active = steps.find(isActiveUpdateStep);
    switch (phase) {
        case 'current':
            return 'Everything in this release is current.';
        case 'available':
            return `${remaining.length} ${remaining.length === 1 ? 'update is' : 'updates are'} ready.`;
        case 'updating':
            return active ? `Updating ${active.label}.` : 'Update in progress.';
        case 'restart-required':
            return 'The Haus App is ready to restart.';
        case 'reload-required':
            return 'Reload to use the updated website.';
        case 'failed': {
            const failed =
                steps.find((step) => step.phase === 'failed' && isConnectedStep(step)) ??
                steps.find((step) => step.phase === 'failed');
            return (
                failed?.detail ?? (failed ? `${failed.label} could not update.` : 'Update failed.')
            );
        }
    }
}

function primaryAction(
    phase: HausUpdatePhase,
    steps: readonly HausUpdateStep[]
): HausUpdateView['primaryAction'] {
    if (phase === 'available') {
        return { kind: 'start', label: 'Update' };
    }
    if (phase === 'restart-required') {
        return { kind: 'restart', label: 'Restart' };
    }
    if (phase === 'failed') {
        return steps.some((step) => step.phase === 'failed' && isConnectedStep(step))
            ? { kind: 'retry', label: 'Try again' }
            : null;
    }
    return null;
}

function isConnectedStep(step: HausUpdateStep) {
    return step.kind === 'desktop-app' || step.connected;
}

function isVersionCurrent(installed: string | null, target: string) {
    if (!installed) {
        return false;
    }
    const installedParts = parseSemver(installed);
    const targetParts = parseSemver(target);
    for (let index = 0; index < 3; index += 1) {
        const difference = (installedParts[index] ?? 0) - (targetParts[index] ?? 0);
        if (difference !== 0) {
            return difference > 0;
        }
    }
    return true;
}

function parseSemver(version: string) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version);
    return match ? match.slice(1).map(Number) : [-1, -1, -1];
}

function compareComputerSteps(left: ComputerUpdateStep, right: ComputerUpdateStep) {
    return left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
}
