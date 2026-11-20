import {
    clearPendingNotice,
    type NoticeReceipt,
    readPendingNotice,
    restorePendingNotice,
} from './pending-notice.ts';
import type { RuntimeSession, RuntimeTurn } from './runtime-driver.ts';

export interface ToolGate {
    toolCallSettled(toolCallId: string): Promise<void>;
    toolCallStarted(toolCallId: string): void;
}

export function openTurnNotices(input: {
    onDelivered(receipt: NoticeReceipt): void;
    primaryNotice: string | null;
    runtimeDir: string;
    session: Pick<RuntimeSession, 'steer'>;
}) {
    let lastDelivered = input.primaryNotice;
    const inFlight = new Set<Promise<boolean>>();
    const steerNotice = async (notice: string) => {
        if (notice === lastDelivered) {
            await clearPendingNotice(input.runtimeDir, notice);
            return true;
        }
        if ((await readPendingNotice(input.runtimeDir))?.notice !== notice) {
            return false;
        }
        const steered = await input.session.steer(notice);
        if (!steered.delivered) {
            return false;
        }
        lastDelivered = notice;
        await clearPendingNotice(input.runtimeDir, notice);
        return true;
    };
    const tracked = (notice: string) => {
        const delivery = steerNotice(notice);
        inFlight.add(delivery);
        const forget = () => inFlight.delete(delivery);
        delivery.then(forget, forget);
        return delivery;
    };
    const coordinator = noticeCoordinator(tracked);
    const deliver = async (notice: string, receipt?: NoticeReceipt) => {
        const accepted =
            notice === input.primaryNotice
                ? await tracked(notice)
                : await coordinator.enqueue(notice);
        if (accepted && receipt) {
            input.onDelivered(receipt);
        }
        return accepted;
    };
    const stored = readPendingNotice(input.runtimeDir).then((pending) =>
        pending ? deliver(pending.notice, pending.receipt) : false
    );
    let closing: Promise<void> | null = null;
    const close = () => {
        closing ??= (async () => {
            coordinator.close();
            await stored;
            await Promise.allSettled([...inFlight]);
        })();
        return closing;
    };
    return {
        close,
        deliver,
        gate: coordinator,
        async returnUnconsumed(turn: Pick<RuntimeTurn, 'unconsumedSteers'>) {
            await close();
            const latest = turn.unconsumedSteers().at(-1);
            return latest === undefined
                ? false
                : await restorePendingNotice(input.runtimeDir, latest);
        },
    };
}

export function noticeCoordinator(deliver: (notice: string) => Promise<boolean>) {
    let pending: { notice: string; resolvers: ((accepted: boolean) => void)[] } | null = null;
    const inFlightToolCalls = new Set<string>();
    let closed = false;
    const take = () => {
        const entry = pending;
        pending = null;
        return entry;
    };
    const flush = async () => {
        const entry = take();
        if (!entry) {
            return;
        }
        let accepted = false;
        try {
            accepted = await deliver(entry.notice);
        } finally {
            for (const resolve of entry.resolvers) {
                resolve(accepted);
            }
        }
    };
    return {
        close() {
            closed = true;
            for (const resolve of take()?.resolvers ?? []) {
                resolve(false);
            }
        },
        enqueue(notice: string) {
            if (closed) {
                return Promise.resolve(false);
            }
            return new Promise<boolean>((resolve) => {
                pending = { notice, resolvers: [...(pending?.resolvers ?? []), resolve] };
            });
        },
        async toolCallSettled(toolCallId: string) {
            inFlightToolCalls.delete(toolCallId);
            if (inFlightToolCalls.size === 0) {
                await flush();
            }
        },
        toolCallStarted(toolCallId: string) {
            inFlightToolCalls.add(toolCallId);
        },
    };
}
