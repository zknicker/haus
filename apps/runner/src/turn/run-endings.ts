import type { DispatchLedger } from '../dispatch/ledger.ts';
import type { RunnerLink, RunStart } from '../run-context.ts';
import { inboxStore } from './inbox-store.ts';
import type { runRecords } from './run-records.ts';
import type { RunTurnResult } from './run-turn.ts';
import { RunnerCrashedError } from './turn-failure.ts';
import { turnSummary } from './turn-summary.ts';

export function thrownRunResult(failure: unknown, signal: AbortSignal) {
    const result: RunTurnResult = signal.aborted
        ? { failure: null, status: 'interrupted', tokenUsage: null }
        : { failure, status: 'failed', tokenUsage: null };
    return result;
}

export async function crashedRunSummary(
    start: RunStart['start'],
    records: ReturnType<typeof runRecords>,
    runtimeDir: string,
    ledger: DispatchLedger
) {
    const visible = await records.visible();
    await inboxStore(runtimeDir).consume(visible.map((message) => message.id));
    const at = new Date().toISOString();
    return turnSummary({
        activity: { operations: [] },
        dispatched: await ledger.dispatchedIn(start.agentId, start.runId),
        endedAt: at,
        result: { failure: new RunnerCrashedError(), status: 'failed', tokenUsage: null },
        sendCount: 0,
        start,
        startedAt: at,
        visibleMessages: visible,
    });
}

export async function skipReplacedRun(
    run: RunStart,
    input: { ledger: DispatchLedger; link: RunnerLink; log: (line: string) => void }
) {
    const { start } = run;
    input.log(
        `Runner skipped run ${start.runId} for ${start.agentId}, which a reset, restart or retire replaced.`
    );
    input.link.send({ agentId: start.agentId, runId: start.runId, type: 'ack' });
    await run.tools.settle();
    await input.ledger.settled(start.agentId, start.runId);
}
