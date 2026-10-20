import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDreamSummariesTable } from '../postgres/schema.ts';
import { HeartbeatRefusedError } from './heartbeat-errors.ts';
import { readRunSource } from './run-source.ts';

/**
 * Stores what a nightly run learned, keyed by run id. Only the nightly (`dream`) run may;
 * a repeat replaces the earlier text.
 */
export async function saveDreamLearned(
    db: HausDatabase,
    runner: ResolvedRunner,
    text: string
): Promise<{ saved: true }> {
    if ((await readRunSource(db, runner)) !== 'dream') {
        throw new HeartbeatRefusedError(
            'DREAM_RUN_REQUIRED',
            'haus heartbeat learned works only in the nightly run.'
        );
    }
    const now = new Date();
    await db
        .insert(agentDreamSummariesTable)
        .values({
            agentId: runner.agentId,
            createdAt: now,
            runId: runner.runId,
            serverId: runner.serverId,
            summary: text,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            set: { summary: text, updatedAt: now },
            target: agentDreamSummariesTable.runId,
        });
    return { saved: true };
}
