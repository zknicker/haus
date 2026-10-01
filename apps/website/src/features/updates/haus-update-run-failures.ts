import type { HausUpdateView } from './haus-update-model.ts';
import type { HausUpdateRunResult } from './haus-update-reconciler.ts';

/**
 * Overlays a settled run's failures on the observed view. A failure only offers a
 * retry while its surface is reachable: a Computer that has since disconnected keeps
 * the observed projection, which waits for reconnection and never offers a retry.
 */
export function applyRunFailures(
    view: HausUpdateView,
    result: HausUpdateRunResult | null
): HausUpdateView {
    if (result?.kind !== 'failed') {
        return view;
    }
    const failures = new Map(
        result.failures.flatMap((failure) => {
            if (failure.stepId === 'update-sequence') {
                return [[failure.stepId, failure.detail] as const];
            }
            const step = view.steps.find((candidate) => candidate.id === failure.stepId);
            if (step?.kind === 'computer' && !step.connected) {
                return [];
            }
            const fact = view.componentFacts.find((candidate) => candidate.id === failure.stepId);
            return fact && fact.status !== 'current'
                ? [[failure.stepId, failure.detail] as const]
                : [];
        })
    );
    if (failures.size === 0) {
        return view;
    }
    const firstFailure = failures.values().next().value ?? 'Haus could not update.';
    return {
        ...view,
        componentFacts: view.componentFacts.map((fact) => {
            const detail = failures.get(fact.id);
            return detail
                ? {
                      ...fact,
                      detail,
                      remedy: fact.remedy ?? 'Try again. If the problem continues, open Settings.',
                      status: 'failed' as const,
                  }
                : fact;
        }),
        detail: firstFailure,
        headline: 'Update needs attention',
        phase: 'failed',
        primaryAction: { kind: 'retry', label: 'Try again' },
    };
}
