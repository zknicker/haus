import type { RunnerTurnTimings } from '@haus/api';
import type { CommittedSend } from '../run-context.ts';
import type { TurnEvent } from './turn-event.ts';

type TurnMilestone = 'firstStreamMs' | 'firstToolMs' | 'harnessReadyMs';
type TurnPhase = 'sessionCreateMs' | 'slotWaitMs';

export type TurnTimings = ReturnType<typeof startTurnTimings>;

export function startTurnTimings(now = () => performance.now()) {
    const startedAt = now();
    const marks: { [K in TurnMilestone | TurnPhase]?: number } = {};
    const since = (at: number) => Math.max(0, Math.round(now() - at));
    const mark = (milestone: TurnMilestone) => {
        marks[milestone] ??= since(startedAt);
    };
    return {
        mark,
        async measure<A>(phase: TurnPhase, operation: () => Promise<A>) {
            const phaseStartedAt = now();
            try {
                return await operation();
            } finally {
                marks[phase] = (marks[phase] ?? 0) + since(phaseStartedAt);
            }
        },
        record(phase: TurnPhase, ms: number) {
            marks[phase] = (marks[phase] ?? 0) + ms;
        },
        async *observe(events: AsyncIterable<TurnEvent>) {
            for await (const event of events) {
                mark('firstStreamMs');
                if (event.type === 'tool-call') {
                    mark('firstToolMs');
                }
                yield event;
            }
        },
        snapshot(sends: readonly CommittedSend[]) {
            const timings: RunnerTurnTimings = { ...marks, ...sendTimings(sends, startedAt, now) };
            return timings;
        },
    };
}

function sendTimings(sends: readonly CommittedSend[], startedAt: number, now: () => number) {
    const first = sends.at(0);
    const last = sends.at(-1);
    if (!(first && last)) {
        return {};
    }
    const lastDone = new Map<string, boolean>();
    for (const send of sends) {
        if (send.chatId) {
            lastDone.set(send.chatId, send.done);
        }
    }
    return {
        afterLastSendMs: Math.max(0, Math.round(now() - last.atMs)),
        doneChats: [...lastDone.values()].filter(Boolean).length,
        firstSendMs: Math.max(0, Math.round(first.atMs - startedAt)),
        lastSendMs: Math.max(0, Math.round(last.atMs - startedAt)),
        sentChats: lastDone.size,
    };
}
