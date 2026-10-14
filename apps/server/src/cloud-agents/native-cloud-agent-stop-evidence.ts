import type { CloudAgentCallback, CloudAgentInputRequest } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentPromptsTable } from '../postgres/schema.ts';
import type { CloudAgentCallbackScope } from './cloud-agent-input-store.ts';

export async function recordNativeCloudAgentStopEvidence(
    db: HausDatabase,
    scope: CloudAgentCallbackScope,
    input: Extract<CloudAgentCallback, { kind: 'stop' | 'failure' }>
) {
    if (input.kind !== 'stop') {
        return;
    }
    await db
        .update(cloudAgentPromptsTable)
        .set({
            stopEvidence: {
                promptId: input.promptId,
                backgroundTasks: input.backgroundTasks,
                sessionCrons: input.sessionCrons ?? null,
                observedAt: new Date().toISOString(),
            },
        })
        .where(
            and(
                eq(cloudAgentPromptsTable.serverId, scope.serverId),
                eq(cloudAgentPromptsTable.runId, scope.runId),
                eq(cloudAgentPromptsTable.promptId, input.promptId)
            )
        );
}

export function isNativeCloudAgentPaused(
    input: Extract<CloudAgentCallback, { kind: 'stop' | 'failure' }>,
    pending: CloudAgentInputRequest[],
    runId: string
) {
    return (
        input.kind === 'stop' &&
        (input.sessionCrons === undefined ||
            input.sessionCrons > 0 ||
            input.backgroundTasks > 0 ||
            pending.some((request) => request.runId === runId))
    );
}
