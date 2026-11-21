import type { AgentTurnSummary } from '@haus/api';
import type { DispatchLedger } from '../dispatch/ledger.ts';
import type { RunJournal } from '../journal/run-journal.ts';
import type { createTurnJournals } from '../journal/turn-journals.ts';
import type { connectionForRun } from '../model-connections/connection-book.ts';
import type { CapacityReader } from '../model-connections/connection-capacity.ts';
import type { createConnectionStatus } from '../model-connections/connection-status.ts';
import type { RunnerLink, RunStart } from '../run-context.ts';
import type { inboxStore } from './inbox-store.ts';
import type { createRunActivity } from './run-activity.ts';
import type { runRecords } from './run-records.ts';
import type { RunTurnResult } from './run-turn.ts';
import { turnSummary } from './turn-summary.ts';
import type { startTurnTimings } from './turn-timings.ts';
import { turnSpanFrame } from './turn-trace.ts';

export interface FinishTurnHost {
    readonly capacity?: CapacityReader;
    readonly journals: ReturnType<typeof createTurnJournals>;
    readonly ledger: DispatchLedger;
    readonly link: RunnerLink;
    readonly settle: (
        start: RunStart['start'],
        records: ReturnType<typeof runRecords>,
        summary: AgentTurnSummary
    ) => Promise<void>;
    readonly status: ReturnType<typeof createConnectionStatus>;
}

export async function finishTurn(
    turn: {
        activity: ReturnType<typeof createRunActivity>;
        connection: ReturnType<typeof connectionForRun>;
        journal: RunJournal | null;
        records: ReturnType<typeof runRecords>;
        result: RunTurnResult;
        run: RunStart;
        startedAt: string;
        store: ReturnType<typeof inboxStore>;
        timings: ReturnType<typeof startTurnTimings>;
    },
    host: FinishTurnHost
) {
    const { activity, connection, records, result, run } = turn;
    const { start } = run;
    activity.close(result.status === 'completed' ? 'completed' : result.status);
    await host.journals.close(turn.journal, start.runId, result);
    if (connection && host.status.afterTurn(connection, result) === 'failed') {
        void host.capacity?.afterAccessFailure(connection.id);
    }
    const visibility = await run.tools.settle();
    await turn.store.consume([
        ...visibility.visibleMessages.map((message) => message.id),
        ...visibility.servedAutomationIds,
    ]);
    const visible = new Map(
        [...(await records.visible()), ...visibility.visibleMessages].map((message) => [
            message.id,
            message,
        ])
    );
    const summary = turnSummary({
        activity: activity.snapshot(),
        dispatched: await host.ledger.dispatchedIn(start.agentId, start.runId),
        endedAt: new Date().toISOString(),
        result,
        sendCount: visibility.sendCount,
        start,
        startedAt: turn.startedAt,
        visibleMessages: [...visible.values()],
    });
    await host.settle(start, records, summary);
    const span = turnSpanFrame(run, summary, turn.timings.snapshot(visibility.sends));
    if (span) {
        host.link.send(span);
    }
}
