import type { HausUpdateStep, HausUpdateView } from './haus-update-model.ts';
import { expectedComputerRestartMs } from './haus-update-timing.ts';
import { isReportedComputerUpdatePhase } from './stalled-computer-update.ts';

const pollMs = 1000;
// A reported Computer phase has no limit here: the projected view fails it once
// the Computer stops reporting (stalled-computer-update.ts), while a Computer
// republishing an unchanged phase, such as a long wait for Agents, is healthy.
const computerWaitLimitMs = expectedComputerRestartMs + 30_000;
const desktopWaitLimitMs = 120_000;

export interface UpdateStepObserver {
    readView: () => HausUpdateView;
    /** Refreshes Computer observations. Concurrent callers must share one request. */
    refreshComputers: () => Promise<void>;
    sleep: (milliseconds: number) => Promise<void>;
}

/**
 * Resolves once the step visibly changes, leaves the view, or loses its Computer
 * connection; throws once an unreported step has shown no change for its limit.
 */
export async function waitForUpdateStepChange(step: HausUpdateStep, observer: UpdateStepObserver) {
    const initial = stepSignature(step);
    const attempts = Math.ceil(waitLimitMs(step) / pollMs);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        await observer.sleep(pollMs);
        if (step.kind === 'computer') {
            await observer.refreshComputers();
        }
        const next = observer.readView().steps.find((candidate) => candidate.id === step.id);
        if (
            !next ||
            stepSignature(next) !== initial ||
            (next.kind === 'computer' && !next.connected)
        ) {
            return;
        }
    }
    throw new Error(`${step.label} did not finish updating.`);
}

function waitLimitMs(step: HausUpdateStep) {
    if (step.kind === 'desktop-app') {
        return desktopWaitLimitMs;
    }
    return isReportedComputerUpdatePhase(step.phase)
        ? Number.POSITIVE_INFINITY
        : computerWaitLimitMs;
}

function stepSignature(step: HausUpdateStep) {
    return JSON.stringify([step.phase, step.currentVersion, step.progress, step.detail]);
}
