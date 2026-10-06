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
    | { kind: 'restarting'; targetVersion: string };

/** The ordered steps one run owns and the one it is working on now. */
export interface HausUpdateSequence {
    activeStepId: string | null;
    stepIds: readonly string[];
}

/** Computers a relaunched App still owes from the press that restarted it. */
export interface HausUpdateResume {
    computerIds: readonly string[];
}

export interface HausUpdateOperations {
    downloadDesktop: (targetVersion: string) => Promise<void>;
    forgetPendingComputers: () => void;
    onSequence?: (sequence: HausUpdateSequence) => void;
    readView: () => HausUpdateView | Promise<HausUpdateView>;
    rememberPendingComputers: (computerIds: readonly string[]) => void;
    restartDesktop: (targetVersion: string) => Promise<void>;
    updateComputer: (input: { computerId: string; targetVersion: string }) => Promise<void>;
    waitForChange: (step: HausUpdateStep) => Promise<void>;
}

export function createHausUpdateController(operations: HausUpdateOperations) {
    let activeRun: Promise<HausUpdateRunResult> | null = null;

    return {
        run(resume?: HausUpdateResume) {
            if (activeRun) {
                return activeRun;
            }
            activeRun = runHausUpdateSequence(operations, resume).finally(() => {
                activeRun = null;
            });
            return activeRun;
        },
    };
}

/**
 * Runs one update at a time: the App first, through its restart, then each
 * Computer in view order. Computers the App restart interrupts are remembered
 * and resumed by the relaunched App.
 */
export async function runHausUpdateSequence(
    operations: HausUpdateOperations,
    resume?: HausUpdateResume
): Promise<HausUpdateRunResult> {
    if (!resume) {
        // A fresh press plans every Computer itself; an older owed resume must not linger.
        operations.forgetPendingComputers();
    }
    const plan = planHausUpdateSequence((await operations.readView()).steps, resume);
    const stepIds = [...(plan.desktop || resume ? ['desktop-app'] : []), ...plan.computerIds];
    const report = (activeStepId: string | null) =>
        operations.onSequence?.({ activeStepId, stepIds });

    if (plan.desktop) {
        report(plan.desktop.id);
        const outcome = await updateDesktop(plan.desktop, plan.computerIds, operations);
        if (outcome) {
            return outcome;
        }
    }

    const failures: HausUpdateFailure[] = [];
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
        .filter((step) => plan.computerIds.includes(step.id) && step.phase === 'failed')
        .map((step) => ({
            detail: step.detail ?? `${step.label} could not update.`,
            stepId: step.id,
        }));
    const settledFailures = deduplicateFailures([...failures, ...finalFailures]).filter(
        (failure) => {
            const step = findStep(finalView, failure.stepId);
            // A disconnected Computer's outcome is unconfirmed, not retryable; the
            // projected view owns that state until it reconnects.
            return !(step && (isCompleteUpdateStep(step) || isDisconnectedComputer(step)));
        }
    );
    return settledFailures.length > 0
        ? { failures: settledFailures, kind: 'failed' }
        : { kind: 'complete' };
}

/**
 * The work one press owns: the App when it needs updating, then every reachable
 * incomplete Computer in view order. A resumed run owns only its remembered
 * Computers; the App already finished before the relaunch.
 */
export function planHausUpdateSequence(
    steps: readonly HausUpdateStep[],
    resume?: HausUpdateResume
): { computerIds: string[]; desktop: DesktopUpdateStep | null } {
    const computers = steps.filter(
        (step): step is ComputerUpdateStep =>
            step.kind === 'computer' && !isCompleteUpdateStep(step) && step.connected
    );
    if (resume) {
        return {
            computerIds: computers
                .filter((step) => resume.computerIds.includes(step.id))
                .map((step) => step.id),
            desktop: null,
        };
    }
    // A checking or restarting App has nothing this press can act on yet.
    const desktop = steps.find(
        (step): step is DesktopUpdateStep =>
            step.kind === 'desktop-app' &&
            ['available', 'downloading', 'failed', 'restart-required'].includes(step.phase)
    );
    return { computerIds: computers.map((step) => step.id), desktop: desktop ?? null };
}

/** Resolves `null` when the App finished in place and Computers may follow. */
async function updateDesktop(
    initialStep: DesktopUpdateStep,
    computerIds: readonly string[],
    operations: HausUpdateOperations
): Promise<HausUpdateRunResult | null> {
    try {
        let step: HausUpdateStep = initialStep;
        if (step.phase !== 'restart-required') {
            if (step.phase === 'available' || step.phase === 'failed') {
                await operations.downloadDesktop(step.targetVersion);
            }
            step = await observeUntilSettled(step, operations);
        }
        if (isCompleteUpdateStep(step)) {
            return null;
        }
        if (step.phase !== 'restart-required') {
            return { failures: [failureFromStep(step)], kind: 'failed' };
        }
        if (computerIds.length > 0) {
            operations.rememberPendingComputers(computerIds);
        }
        await operations.restartDesktop(step.targetVersion);
        return { kind: 'restarting', targetVersion: step.targetVersion };
    } catch (error) {
        operations.forgetPendingComputers();
        return { failures: [failureForStep(initialStep, error)], kind: 'failed' };
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
