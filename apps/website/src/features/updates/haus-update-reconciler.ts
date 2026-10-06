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

/** `appReady`: a downloaded App waits for the operator to restart it. */
export type HausUpdateRunResult =
    | { appReady: boolean; kind: 'complete' }
    | { appReady: boolean; failures: readonly HausUpdateFailure[]; kind: 'failed' };

/** The ordered steps one run owns and the one it is working on now. */
export interface HausUpdateSequence {
    activeStepId: string | null;
    stepIds: readonly string[];
}

export interface HausUpdateOperations {
    downloadDesktop: (targetVersion: string) => Promise<void>;
    onSequence?: (sequence: HausUpdateSequence) => void;
    readView: () => HausUpdateView | Promise<HausUpdateView>;
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

/**
 * Runs one update at a time: the App download first, then each Computer in view
 * order. A failed step never stops the next. The App is never restarted here;
 * the result says whether a downloaded App is waiting for the operator.
 */
export async function runHausUpdateSequence(
    operations: HausUpdateOperations
): Promise<HausUpdateRunResult> {
    const plan = planHausUpdateSequence((await operations.readView()).steps);
    const stepIds = [...(plan.desktop ? [plan.desktop.id] : []), ...plan.computerIds];
    const report = (activeStepId: string | null) =>
        operations.onSequence?.({ activeStepId, stepIds });

    const failures: HausUpdateFailure[] = [];
    if (plan.desktop) {
        report(plan.desktop.id);
        const failure = await downloadDesktop(plan.desktop, operations);
        if (failure) {
            failures.push(failure);
        }
    }

    for (const computerId of plan.computerIds) {
        const step = findStep(await operations.readView(), computerId);
        // A Computer that finished, left, or disconnected since planning is not retried.
        if (step?.kind !== 'computer' || isCompleteUpdateStep(step) || !step.connected) {
            continue;
        }
        report(computerId);
        const failure = await updateComputer(step, operations);
        if (failure) {
            failures.push(failure);
        }
    }
    report(null);

    const finalView = await operations.readView();
    const finalFailures = finalView.steps
        .filter((step) => stepIds.includes(step.id) && step.phase === 'failed')
        .map(failureFromStep);
    const settledFailures = deduplicateFailures([...failures, ...finalFailures]).filter(
        (failure) => {
            const step = findStep(finalView, failure.stepId);
            // A disconnected Computer's outcome is unconfirmed, not retryable; the
            // projected view owns that state until it reconnects.
            return !(
                step &&
                (isCompleteUpdateStep(step) ||
                    step.phase === 'restart-required' ||
                    isDisconnectedComputer(step))
            );
        }
    );
    const appReady = finalView.steps.some(
        (step) => step.kind === 'desktop-app' && step.phase === 'restart-required'
    );
    return settledFailures.length > 0
        ? { appReady, failures: settledFailures, kind: 'failed' }
        : { appReady, kind: 'complete' };
}

/**
 * The work one press owns: the App download when one is needed, then every
 * reachable incomplete Computer in view order. A downloaded App is not a step.
 */
export function planHausUpdateSequence(steps: readonly HausUpdateStep[]): {
    computerIds: string[];
    desktop: DesktopUpdateStep | null;
} {
    const computers = steps.filter(
        (step): step is ComputerUpdateStep =>
            step.kind === 'computer' && !isCompleteUpdateStep(step) && step.connected
    );
    // A checking or restarting App has nothing this press can act on yet.
    const desktop = steps.find(
        (step): step is DesktopUpdateStep =>
            step.kind === 'desktop-app' &&
            ['available', 'downloading', 'failed'].includes(step.phase)
    );
    return { computerIds: computers.map((step) => step.id), desktop: desktop ?? null };
}

async function downloadDesktop(
    initialStep: DesktopUpdateStep,
    operations: HausUpdateOperations
): Promise<HausUpdateFailure | null> {
    try {
        if (initialStep.phase === 'available' || initialStep.phase === 'failed') {
            await operations.downloadDesktop(initialStep.targetVersion);
        }
        const step = await observeUntilSettled(initialStep, operations);
        return isCompleteUpdateStep(step) || step.phase === 'restart-required'
            ? null
            : failureFromStep(step);
    } catch (error) {
        return failureForStep(initialStep, error);
    }
}

async function updateComputer(
    initialStep: ComputerUpdateStep,
    operations: HausUpdateOperations
): Promise<HausUpdateFailure | null> {
    try {
        // An update already running, such as one started elsewhere, is observed, never resubmitted.
        if (['available', 'failed', 'idle'].includes(initialStep.phase)) {
            await operations.updateComputer({
                computerId: initialStep.id,
                targetVersion: initialStep.targetVersion,
            });
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
            return step;
        }
        step = next;
    }
    return step;
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

function findStep(view: HausUpdateView, stepId: string) {
    return view.steps.find((step) => step.id === stepId);
}

function deduplicateFailures(failures: readonly HausUpdateFailure[]) {
    return [...new Map(failures.map((failure) => [failure.stepId, failure])).values()];
}

function failureFromStep(step: HausUpdateStep): HausUpdateFailure {
    return { detail: step.detail ?? `${step.label} could not update.`, stepId: step.id };
}

function failureForStep(step: HausUpdateStep, error: unknown): HausUpdateFailure {
    return {
        detail: error instanceof Error ? error.message : `${step.label} could not update.`,
        stepId: step.id,
    };
}
