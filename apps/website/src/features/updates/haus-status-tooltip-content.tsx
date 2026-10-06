import { RelativeTime } from '../../components/time/relative-time.tsx';
import type { HausUpdateView } from './haus-update-model.ts';
import { isActiveUpdateStep } from './haus-update-model.ts';
import { HausUpdateProgress } from './haus-update-progress.tsx';
import type { HausUpdateSequence } from './haus-update-reconciler.ts';
import { HausVersionBreakdown } from './haus-version-breakdown.tsx';
import type { OfflineComputerNotice } from './use-offline-computers.ts';

export function UpdateTooltipContent({
    sequence = null,
    title,
    view,
}: {
    sequence?: HausUpdateSequence | null;
    title?: string;
    view: HausUpdateView;
}) {
    const activeStepIds = new Set(view.steps.filter(isActiveUpdateStep).map((step) => step.id));
    const waitingStepIds = queuedStepIds(sequence);
    const visibleFacts = view.componentFacts
        .filter(
            (fact) =>
                fact.status !== 'current' &&
                fact.status !== 'external' &&
                !activeStepIds.has(fact.id)
        )
        .map((fact) =>
            waitingStepIds.has(fact.id) ? { ...fact, status: 'waiting' as const } : fact
        );
    const hasSurfaceFailure = visibleFacts.some((fact) => fact.status === 'failed');
    return (
        <div className="grid gap-2.5">
            <p className="text-foreground text-sm">{title ?? tooltipTitle(view)}</p>
            <HausUpdateProgress steps={view.steps} />
            {visibleFacts.length > 0 ? <HausVersionBreakdown facts={visibleFacts} /> : null}
            {view.phase === 'failed' && !hasSurfaceFailure ? (
                <p className="grid gap-0.5 text-danger text-sm">
                    <span>{view.detail}</span>
                    <span className="text-foreground">
                        Try again. If it continues, restart Haus.
                    </span>
                </p>
            ) : null}
        </div>
    );
}

export function OfflineComputersTooltipContent({
    computers,
}: {
    computers: readonly OfflineComputerNotice[];
}) {
    return (
        <div className="grid gap-2.5 text-sm">
            <p className="text-foreground">
                {computers.length === 1 ? 'Computer offline' : 'Computers offline'}
            </p>
            <dl className="grid gap-2.5">
                {computers.map((computer) => (
                    <div className="grid gap-0.5" key={computer.id}>
                        <dt className="text-foreground">{computer.name}</dt>
                        <dd className="text-muted">
                            Last connected:{' '}
                            <RelativeTime fallback="Never" value={computer.lastConnectedAt} />
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

/** Steps the running sequence has not reached yet. */
function queuedStepIds(sequence: HausUpdateSequence | null) {
    if (!sequence) {
        return new Set<string>();
    }
    const activeIndex = sequence.activeStepId
        ? sequence.stepIds.indexOf(sequence.activeStepId)
        : -1;
    return new Set(sequence.stepIds.slice(activeIndex + 1));
}

function tooltipTitle(view: HausUpdateView) {
    switch (view.phase) {
        case 'available':
            return 'Click to update';
        case 'restart-required':
            return 'Click to restart';
        case 'reload-required':
            return 'Update available. Reload Haus.';
        case 'failed':
            return 'Click to try again';
        case 'updating':
            return 'Updating';
        case 'current':
            return 'Up to date';
    }
}
