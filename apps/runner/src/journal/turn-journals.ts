import type { RecoveredDispatch } from '../dispatch/ledger.ts';
import type { JournalUploads } from './journal-uploads.ts';
import { settleRecoveredJournal } from './recovered-journal.ts';
import { openRunJournal, type RunJournal } from './run-journal.ts';

type JournalStatus = 'completed' | 'failed' | 'interrupted';

export function createTurnJournals(input: {
    agentDirOf: (agentId: string) => string;
    log: (line: string) => void;
    uploads?: JournalUploads;
}) {
    const uploads = input.uploads ? { uploads: input.uploads } : {};
    const report = (runId: string) => (error: unknown) =>
        input.log(
            `Runner journal of ${runId} failed: ${error instanceof Error ? error.message : String(error)}`
        );
    const settle = (agentId: string, runId: string, dispatches: RecoveredDispatch[]) =>
        settleRecoveredJournal({
            agentDir: input.agentDirOf(agentId),
            agentId,
            dispatches,
            runId,
            ...uploads,
        }).catch(report(runId));
    return {
        async close(
            journal: RunJournal | null,
            runId: string,
            result: { failure: unknown; status: JournalStatus }
        ) {
            await journal?.close(result).catch(report(runId));
        },
        crashed: (agentId: string, runId: string) => settle(agentId, runId, []),
        open: (agentId: string, runId: string) =>
            openRunJournal({ agentDir: input.agentDirOf(agentId), agentId, runId, ...uploads }),
        async recovered(dispatches: readonly RecoveredDispatch[]) {
            const byRun = new Map<string, RecoveredDispatch[]>();
            for (const dispatch of dispatches) {
                const run = JSON.stringify([dispatch.agentId, dispatch.key.runId]);
                byRun.set(run, [...(byRun.get(run) ?? []), dispatch]);
            }
            for (const [first, ...rest] of byRun.values()) {
                if (first) {
                    await settle(first.agentId, first.key.runId, [first, ...rest]);
                }
            }
        },
    };
}
