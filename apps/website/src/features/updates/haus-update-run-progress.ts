import type { HausUpdateStep, HausUpdateView } from './haus-update-model.ts';
import { isActiveUpdateStep } from './haus-update-model.ts';
import type { HausUpdateSequence } from './haus-update-reconciler.ts';

/** How far the run is, and the steps it covers, in run order. */
export interface HausUpdateRunProgress {
    activeStep: HausUpdateStep | null;
    /** Cumulative fill over every step, 0–1. Each step owns an equal slice. */
    fraction: number;
    /** 1-based place of the active step, or `null` when none is active. */
    position: number | null;
    /** Steps the run owns; without a run, the live active steps. */
    steps: readonly HausUpdateStep[];
}

/**
 * One cumulative fill for the whole run: steps before the active one count as
 * their full slice, the active step fills its slice by `stepFraction`, and later
 * steps are empty. Without a run, the live active steps share the circle.
 */
export function hausUpdateRunProgress(
    view: HausUpdateView,
    sequence: HausUpdateSequence | null
): HausUpdateRunProgress {
    if (sequence && sequence.stepIds.length > 0) {
        const steps = sequence.stepIds.flatMap((id) => {
            const step = view.steps.find((candidate) => candidate.id === id);
            return step ? [step] : [];
        });
        const activeIndex =
            sequence.activeStepId === null
                ? sequence.stepIds.length
                : sequence.stepIds.indexOf(sequence.activeStepId);
        const activeStep = view.steps.find((step) => step.id === sequence.activeStepId) ?? null;
        const filled = activeIndex + (activeStep ? stepFraction(activeStep) : 0);
        return {
            activeStep,
            fraction: clamp(filled / sequence.stepIds.length),
            position: activeStep ? activeIndex + 1 : null,
            steps,
        };
    }
    const steps = view.steps.filter(isActiveUpdateStep);
    const filled = steps.reduce((total, step) => total + stepFraction(step), 0);
    return {
        activeStep: steps[0] ?? null,
        fraction: steps.length > 0 ? clamp(filled / steps.length) : 0,
        position: null,
        steps,
    };
}

/**
 * How much of its own slice the active step has filled. Phases without byte
 * progress take fixed, increasing marks so the circle never moves backward
 * between phases. A step that is failed or idle has not started this run yet.
 */
export function stepFraction(step: HausUpdateStep): number {
    if (step.kind === 'desktop-app') {
        switch (step.phase) {
            case 'downloading':
                return clamp(step.progress ?? 0);
            case 'restart-required':
            case 'restarting':
            case 'current':
                return 1;
            default:
                return 0;
        }
    }
    switch (step.phase) {
        case 'checking':
        case 'requested':
            return 0.02;
        case 'downloading':
            return 0.05 + 0.55 * clamp(step.progress ?? 0);
        case 'verifying':
            return 0.65;
        case 'installing':
            return 0.75;
        case 'waiting-for-agents':
            return 0.8;
        case 'restarting':
            return 0.9;
        case 'complete':
        case 'current':
            return 1;
        default:
            return 0;
    }
}

/** A run's displayed fill never decreases; a new run key starts over. */
export interface HausUpdatePeak {
    key: string;
    value: number;
}

export function holdPeak(peak: HausUpdatePeak | null, key: string, value: number): HausUpdatePeak {
    return peak?.key === key ? { key, value: Math.max(peak.value, value) } : { key, value };
}

function clamp(value: number) {
    return Math.min(1, Math.max(0, value));
}
