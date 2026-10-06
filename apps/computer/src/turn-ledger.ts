import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type AgentTurnActivitySummary, agentTurnActivitySummarySchema } from '@haus/api';
import * as z from 'zod';

/**
 * The Computer-local record of one run's span and settled totals while it is
 * unsettled. The Server resends an accepted run with the same `runId` after the
 * Computer restarts, and that relaunch must report the whole run — its first
 * start and every operation the lost launch settled — not just its own tail.
 * The ledger is removed once the run's turn summary is reported.
 */
export interface TurnLedger {
    readonly activity: AgentTurnActivitySummary;
    readonly startedAt: string;
}

const turnLedgerSchema = z
    .object({
        activity: agentTurnActivitySummarySchema,
        startedAt: z.iso.datetime({ offset: true }),
    })
    .strict();

const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

/** Opens the run's ledger, resuming an earlier launch's when one survives. */
export async function openTurnLedger(input: { agentRoot: string; now: () => Date; runId: string }) {
    const path = turnLedgerPath(input.agentRoot, input.runId);
    const existing = await readTurnLedger(path);
    const startedAt = existing?.startedAt ?? input.now().toISOString();
    const opened: TurnLedger = existing ?? { activity: { operations: [] }, startedAt };
    let writes: Promise<void> = persist(path, opened);
    return {
        seed: opened.activity,
        startedAt,
        /** Queues the latest totals; writes stay ordered and never reject. */
        record(activity: AgentTurnActivitySummary) {
            writes = writes.then(() => persist(path, { activity, startedAt }));
        },
        /** Resolves once every queued write has landed. */
        flush(): Promise<void> {
            return writes;
        },
        /** Drops the ledger once the run's summary has been reported. */
        async remove() {
            await writes;
            await rm(path, { force: true }).catch(() => undefined);
        },
    };
}

export type OpenTurnLedger = Awaited<ReturnType<typeof openTurnLedger>>;

export function turnLedgerPath(agentRoot: string, runId: string): string {
    if (!runIdPattern.test(runId)) {
        throw new Error('The turn ledger run id is invalid.');
    }
    return join(agentRoot, 'runtime', 'turns', `${runId}.json`);
}

async function readTurnLedger(path: string): Promise<TurnLedger | null> {
    try {
        const parsed = turnLedgerSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

/** Best effort: a lost write costs only resume accuracy, never the turn. */
async function persist(path: string, ledger: TurnLedger): Promise<void> {
    const temporary = `${path}.${process.pid}.tmp`;
    try {
        await mkdir(join(path, '..'), { mode: 0o700, recursive: true });
        await writeFile(temporary, `${JSON.stringify(ledger)}\n`, { mode: 0o600 });
        await rename(temporary, path);
    } catch {
        await rm(temporary, { force: true }).catch(() => undefined);
    }
}
