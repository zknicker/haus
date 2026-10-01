import {
    type ComputerUpdateStep,
    type DesktopUpdateStep,
    type HausUpdateStep,
    type HausUpdateView,
    isCompleteUpdateStep,
} from './haus-update-model.ts';

export interface HausUpdateFailure {
    detail: string;
    stepId: string;
}

export type HausUpdateRunResult =
    | { kind: 'complete' }
    | { failures: readonly HausUpdateFailure[]; kind: 'failed' }
    | { kind: 'restart-required'; targetVersion: string }
    | { kind: 'restarting'; targetVersion: string };

export interface HausUpdateOperations {
    downloadDesktop: (targetVersion: string) => Promise<void>;
    readView: () => HausUpdateView | Promise<HausUpdateView>;
    restartDesktop: (targetVersion: string) => Promise<void>;
    updateComputer: (input: { computerId: string; targetVersion: string }) => Promise<void>;
    waitForChange: (step: HausUpdateStep) => Promise<void>;
}

export function createHausUpdateController(operations: HausUpdateOperations) {
    let activeRun: Promise<HausUpdateRunResult> | null = null;

    return {
        run() {
            if (activeRun) {
                return activeRun;
            }
            activeRun = runHausUpdateSequence(operations).finally(() => {
                activeRun = null;
            });
            return activeRun;
        },
    };
}

export async function runHausUpdateSequence(
    operations: HausUpdateOperations
): Promise<HausUpdateRunResult> {
    const initialView = await operations.readView();
    const initialRestart = desktopRestartStep(initialView.steps);
    if (initialRestart) {
        try {
            await operations.restartDesktop(initialRestart.targetVersion);
            return { kind: 'restarting', targetVersion: initialRestart.targetVersion };
        } catch (error) {
            return {
                failures: [failureForStep(initialRestart, error)],
                kind: 'failed',
            };
        }
    }

    const selectedSteps = selectHausUpdateBatch(initialView.steps);
    const outcomes = await Promise.all(
        selectedSteps.map((step) => reconcileStep(step, operations))
    );
    const finalView = await operations.readView();
    const finalRestart = desktopRestartStep(finalView.steps);
    if (finalRestart) {
        return { kind: 'restart-required', targetVersion: finalRestart.targetVersion };
    }

    const selectedIds = new Set(selectedSteps.map((step) => step.id));
    const finalFailures = finalView.steps
        .filter((step) => selectedIds.has(step.id) && step.phase === 'failed')
        .map((step) => ({
            detail: step.detail ?? `${step.label} could not update.`,
            stepId: step.id,
        }));
    const failures = deduplicateFailures([
        ...outcomes.filter((failure): failure is HausUpdateFailure => failure !== null),
        ...finalFailures,
    ]).filter((failure) => {
        const step = finalView.steps.find((candidate) => candidate.id === failure.stepId);
        // A disconnected Computer's outcome is unconfirmed, not retryable; the
        // projected view owns that state until it reconnects.
        return !(step && (isCompleteUpdateStep(step) || isDisconnectedComputer(step)));
    });
    return failures.length > 0 ? { failures, kind: 'failed' } : { kind: 'complete' };
}

/**
 * The steps one press acts on: a ready App restart alone, otherwise every
 * incomplete step whose surface is reachable now.
 */
export function selectHausUpdateBatch(steps: readonly HausUpdateStep[]): HausUpdateStep[] {
    const restart = desktopRestartStep(steps);
    if (restart) {
        return [restart];
    }
    return steps.filter((step) => !(isCompleteUpdateStep(step) || isDisconnectedComputer(step)));
}

async function reconcileStep(
    initialStep: HausUpdateStep,
    operations: HausUpdateOperations
): Promise<HausUpdateFailure | null> {
    try {
        if (shouldStartComputer(initialStep)) {
            await operations.updateComputer({
                computerId: initialStep.id,
                targetVersion: initialStep.targetVersion,
            });
        } else if (shouldDownloadDesktop(initialStep)) {
            await operations.downloadDesktop(initialStep.targetVersion);
        }
        await observeUntilSettled(initialStep, operations);
        return null;
    } catch (error) {
        return failureForStep(initialStep, error);
    }
}

async function observeUntilSettled(initialStep: HausUpdateStep, operations: HausUpdateOperations) {
    let step = findStep(await operations.readView(), initialStep.id) ?? initialStep;
    while (!isSettled(step)) {
        await operations.waitForChange(step);
        const next = findStep(await operations.readView(), step.id);
        if (!next) {
            return;
        }
        step = next;
    }
}

function shouldStartComputer(step: HausUpdateStep): step is ComputerUpdateStep {
    return (
        step.kind === 'computer' &&
        (step.phase === 'available' || step.phase === 'failed' || step.phase === 'idle')
    );
}

function shouldDownloadDesktop(step: HausUpdateStep): step is DesktopUpdateStep {
    return step.kind === 'desktop-app' && (step.phase === 'available' || step.phase === 'failed');
}

function isSettled(step: HausUpdateStep) {
    return (
        isCompleteUpdateStep(step) ||
        isDisconnectedComputer(step) ||
        step.phase === 'failed' ||
        step.phase === 'restart-required'
    );
}

function isDisconnectedComputer(step: HausUpdateStep) {
    return step.kind === 'computer' && !step.connected;
}

function desktopRestartStep(steps: readonly HausUpdateStep[]) {
    return steps.find(
        (step): step is DesktopUpdateStep =>
            step.kind === 'desktop-app' && step.phase === 'restart-required'
    );
}

function findStep(view: HausUpdateView, stepId: string) {
    return view.steps.find((step) => step.id === stepId);
}

function deduplicateFailures(failures: readonly HausUpdateFailure[]) {
    return [...new Map(failures.map((failure) => [failure.stepId, failure])).values()];
}

function failureForStep(step: HausUpdateStep, error: unknown): HausUpdateFailure {
    return {
        detail: error instanceof Error ? error.message : `${step.label} could not update.`,
        stepId: step.id,
    };
}
