import { Effect } from 'effect';
import type { RuntimeSession, RuntimeTurn } from '../runtime/driver.ts';
import type { HarnessTurnInput } from './executor.ts';
import { createNoticeDelivery } from './steer-inbox-notice.ts';
import {
    createNoticeCoordinator,
    deliverStoredNotice,
    restorePendingNotice,
} from './stored-notice.ts';

type NoticeTurnInput = Pick<
    HarnessTurnInput,
    | 'agentId'
    | 'agentRoot'
    | 'onStoredNoticeDelivered'
    | 'registerNoticeSink'
    | 'runId'
    | 'runtime'
    | 'runtimeId'
>;

/**
 * Wires a running turn's busy notices: the primary notice is delivered at once, any other waits
 * for a tool boundary with no call in flight, and a stored notice from before the turn is
 * offered first. `ready` resolves once that stored notice was handed to delivery.
 */
export function openTurnNotices(
    live: Pick<RuntimeSession, 'steer'>,
    input: NoticeTurnInput,
    primaryNotice: string | null
) {
    const steerNotice = createNoticeDelivery(live, input, primaryNotice);
    // Every delivery is tracked until the runtime answers its steer, so `close` resolves only
    // once each steer is either acked (and visible to `unconsumedSteers`) or refused.
    const inFlight = new Set<Promise<boolean>>();
    const deliverNotice = (notice: string) => {
        const delivery = steerNotice(notice);
        inFlight.add(delivery);
        void delivery.then(
            () => inFlight.delete(delivery),
            () => inFlight.delete(delivery)
        );
        return delivery;
    };
    const coordinator = createNoticeCoordinator(deliverNotice);
    const deliverAtSafeBoundary = async (notice: string) =>
        notice === primaryNotice ? await deliverNotice(notice) : await coordinator.enqueue(notice);
    const unregister = input.registerNoticeSink?.(deliverAtSafeBoundary);
    const ready = Promise.withResolvers<void>();
    const storedDelivery = deliverStoredNotice(
        input.agentRoot,
        deliverAtSafeBoundary,
        input.onStoredNoticeDelivered,
        () => ready.resolve()
    );
    let closing: Promise<void> | null = null;
    return {
        /** Stops new deliveries and waits out every steer still awaiting the runtime's answer. */
        close() {
            closing ??= (async () => {
                unregister?.();
                coordinator.close();
                await storedDelivery;
                // Each delivery's caller handles its failure; here only its settling matters.
                await Promise.allSettled([...inFlight]);
            })();
            return closing;
        },
        coordinator,
        ready: ready.promise,
    };
}

/**
 * A notice the runtime acknowledged but never handed the model (a Stop cancelled it, or it was
 * still queued at turn end) goes back on the pending path for the next turn. Each notice is a
 * complete inbox summary, so only the latest matters.
 */
export async function returnUnconsumedNotices(
    turn: Pick<RuntimeTurn, 'unconsumedSteers'>,
    input: NoticeTurnInput
): Promise<void> {
    const notices = turn.unconsumedSteers();
    const latest = notices.at(-1);
    if (latest === undefined) {
        return;
    }
    const restored = await restorePendingNotice(input.agentRoot, latest);
    await input.runtime.runPromise(
        Effect.logInfo(
            'An accepted inbox notice never reached the model; kept for next turn.'
        ).pipe(
            Effect.annotateLogs({
                agentId: input.agentId,
                event: 'inbox-notice-returned',
                notices: notices.length,
                restored,
                runId: input.runId,
                runtimeId: input.runtimeId,
            })
        )
    );
}
