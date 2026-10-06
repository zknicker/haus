import type { HausUpdateView } from './haus-update-model.ts';
import { isActiveUpdateStep, isCompleteUpdateStep } from './haus-update-model.ts';
import type { HausUpdateSequence } from './haus-update-reconciler.ts';

const circleCenter = 10;
const circleRadius = 8;
const indeterminateArc = 0.25;

export interface HausUpdateDonutStatus {
    label: string;
    /** The active step's progress; `null` while it reports none. */
    progress: number | null;
}

/** One circle for the one update running now; an unmeasured step spins instead. */
export function HausUpdateDonut({ status }: { status: HausUpdateDonutStatus }) {
    const progress = status.progress === null ? null : clampProgress(status.progress);
    const arc = progress ?? indeterminateArc;
    return (
        <svg
            aria-label={status.label}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
            className={
                progress === null ? 'size-5 animate-spin motion-reduce:animate-none' : 'size-5'
            }
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
                className="fill-none stroke-current"
                cx={circleCenter}
                cy={circleCenter}
                pathLength={1}
                r={circleRadius}
                strokeDasharray={`${arc} ${1 - arc}`}
                strokeWidth={3}
                transform={`rotate(-90 ${circleCenter} ${circleCenter})`}
            />
        </svg>
    );
}

/**
 * Names the step a run is working on and its place in the run, such as
 * "Updating Computer · Home (2 of 3)". Without a run, the first active step.
 */
export function updateDonutStatus(
    view: HausUpdateView,
    sequence: HausUpdateSequence | null
): HausUpdateDonutStatus {
    const active =
        view.steps.find((step) => step.id === sequence?.activeStepId) ??
        view.steps.find(isActiveUpdateStep);
    if (!active) {
        return { label: 'Updating Haus', progress: null };
    }
    const stepIds = sequence?.stepIds ?? [];
    const position = stepIds.indexOf(active.id);
    const count =
        position >= 0 && stepIds.length > 1 ? ` (${position + 1} of ${stepIds.length})` : '';
    return {
        label: `Updating ${active.label}${count}`,
        progress: isCompleteUpdateStep(active) ? 1 : active.progress,
    };
}

function clampProgress(progress: number) {
    return Math.min(1, Math.max(0, progress));
}
