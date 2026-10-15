import type { HausDatabase } from '../postgres/connection.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import type {
    LinearDeliveryHandler,
    LinearDeliveryOutcome,
    LinearDeliveryRow,
} from './delivery-handler.ts';
import { detectLinearHandoff } from './handoff.ts';

/** What other slices add to a data delivery's routing. */
export interface LinearDataChangeHooks {
    /**
     * Issue chips: evicts the issue cache and prepares `linear.onIssueChanged`
     * (published after commit). Owned by the chips slice.
     */
    issueChanged?(tx: HausDatabase, row: LinearDeliveryRow): Promise<PreparedRealtimeEvent | null>;
    /** `linear` Trigger matching and fires (specs/linear-triggers.md). Owned by the Triggers slice. */
    triggers?: LinearDeliveryHandler;
}

/**
 * Issue, Comment, Project, IssueLabel, and WorkflowState deliveries
 * (specs/linear-app.md#durable-ingest step 3): handoff detection, then the
 * issue-chip and Trigger hooks, in one transaction. A deferral from any step
 * rolls the whole transaction back (the worker's contract).
 */
export function linearDataChangeHandler(input: {
    appOrigin: string;
    hooks: LinearDataChangeHooks;
}): LinearDeliveryHandler {
    const { hooks } = input;
    const prepare = hooks.triggers?.prepare?.bind(hooks.triggers);
    return {
        apply: async (tx, row, now, prepared): Promise<LinearDeliveryOutcome> => {
            const handoff = await detectLinearHandoff(tx, row, now, input.appOrigin);
            if (handoff.kind === 'defer') {
                return handoff;
            }
            const announce = handoff.kind === 'handed_off' ? [...handoff.announce] : [];
            const changed = await hooks.issueChanged?.(tx, row);
            if (changed) {
                announce.push(changed);
            }
            const fired = hooks.triggers
                ? await hooks.triggers.apply(tx, row, now, prepared)
                : null;
            if (fired?.kind === 'defer') {
                return fired;
            }
            const triggered = fired?.kind === 'done' ? fired : null;
            return {
                announce: [...announce, ...(triggered?.announce ?? [])],
                kind: 'done',
                routed: (handoff.kind === 'handed_off' ? 1 : 0) + (triggered?.routed ?? 0),
                wakes: triggered?.wakes ?? [],
            };
        },
        ...(prepare ? { prepare } : {}),
    };
}
