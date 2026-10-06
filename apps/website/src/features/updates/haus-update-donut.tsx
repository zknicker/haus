import * as React from 'react';
import type { HausUpdateView } from './haus-update-model.ts';
import type { HausUpdateSequence } from './haus-update-reconciler.ts';
import {
    type HausUpdatePeak,
    hausUpdateRunProgress,
    holdPeak,
} from './haus-update-run-progress.ts';

const circleCenter = 10;
const circleRadius = 8;

export interface HausUpdateDonutStatus {
    label: string;
    /** Cumulative fill for the whole run, 0–1. */
    progress: number;
    /** Identifies the run; the fill only holds its peak within one run. */
    runKey: string;
}

/** One circle that fills once over the whole run and never moves backward. */
export function HausUpdateDonut({ status }: { status: HausUpdateDonutStatus }) {
    const progress = useRunPeak(status.runKey, status.progress);
    return (
        <svg
            aria-label={status.label}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(progress * 100)}
            className="size-5"
            role="progressbar"
            viewBox="0 0 20 20"
        >
            <circle
                className="fill-none stroke-current opacity-30"
                cx={circleCenter}
                cy={circleCenter}
                r={circleRadius}
                strokeWidth={3}
            />
            <circle
                className="fill-none stroke-current transition-[stroke-dasharray] duration-300 ease-out motion-reduce:transition-none"
                cx={circleCenter}
                cy={circleCenter}
                pathLength={1}
                r={circleRadius}
                strokeDasharray={`${progress} ${1 - progress}`}
                strokeWidth={3}
                transform={`rotate(-90 ${circleCenter} ${circleCenter})`}
            />
        </svg>
    );
}

/**
 * Names the step a run is working on and its place in the run, such as
 * "Updating Computer · Home (2 of 3)", with the run's cumulative fill.
 */
export function updateDonutStatus(
    view: HausUpdateView,
    sequence: HausUpdateSequence | null
): HausUpdateDonutStatus {
    const run = hausUpdateRunProgress(view, sequence);
    const count =
        run.position !== null && run.steps.length > 1
            ? ` (${run.position} of ${sequence?.stepIds.length ?? run.steps.length})`
            : '';
    return {
        label: run.activeStep ? `Updating ${run.activeStep.label}${count}` : 'Updating Haus',
        progress: run.fraction,
        runKey: sequence ? `run:${sequence.stepIds.join(',')}` : 'live',
    };
}

function useRunPeak(runKey: string, progress: number) {
    const [peak, setPeak] = React.useState<HausUpdatePeak>({ key: runKey, value: progress });
    const next = holdPeak(peak, runKey, progress);
    // Adjusting state during render keeps a lower reading from ever painting.
    if (next.key !== peak.key || next.value !== peak.value) {
        setPeak(next);
    }
    return next.value;
}
