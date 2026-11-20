import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentDispatchesTable } from '../postgres/schema.ts';

export interface DispatchScope {
    agentId: string;
    dispatchId: string;
    runId: string;
    serverId: string;
}

export interface DispatchResponse {
    body: unknown;
    status: number;
}

export type DispatchClaim =
    | { id: string; state: 'claimed' }
    | { id: string; state: 'accepted' }
    | { fingerprint: string; id: string; response: DispatchResponse; state: 'finished' }
    | { id: string; state: 'unknown' };

export async function claimDispatch(
    db: HausDatabase,
    scope: DispatchScope,
    request: { fingerprint: string; route: string }
) {
    const [inserted] = await db
        .insert(agentDispatchesTable)
        .values({
            ...scope,
            acceptedAt: new Date(),
            id: createOpaqueId('adp'),
            requestFingerprint: request.fingerprint,
            route: request.route,
            state: 'accepted',
        })
        .onConflictDoNothing({
            target: [
                agentDispatchesTable.serverId,
                agentDispatchesTable.agentId,
                agentDispatchesTable.dispatchId,
            ],
        })
        .returning({ id: agentDispatchesTable.id });
    if (inserted) {
        return { id: inserted.id, state: 'claimed' } satisfies DispatchClaim;
    }
    const [row] = await db
        .select()
        .from(agentDispatchesTable)
        .where(
            and(
                eq(agentDispatchesTable.serverId, scope.serverId),
                eq(agentDispatchesTable.agentId, scope.agentId),
                eq(agentDispatchesTable.dispatchId, scope.dispatchId)
            )
        )
        .limit(1);
    if (!row) {
        throw new Error(`Dispatch ${scope.dispatchId} vanished between its insert and its read.`);
    }
    if (row.state === 'finished' && row.responseStatus !== null) {
        return {
            fingerprint: row.requestFingerprint,
            id: row.id,
            response: { body: row.responseBody, status: row.responseStatus },
            state: 'finished',
        } satisfies DispatchClaim;
    }
    return {
        id: row.id,
        state: row.state === 'unknown' ? 'unknown' : 'accepted',
    } satisfies DispatchClaim;
}

export async function finishDispatch(db: HausDatabase, id: string, response: DispatchResponse) {
    await db
        .update(agentDispatchesTable)
        .set({
            finishedAt: new Date(),
            responseBody: response.body,
            responseStatus: response.status,
            state: 'finished',
        })
        .where(and(eq(agentDispatchesTable.id, id), eq(agentDispatchesTable.state, 'accepted')));
}

export async function markDispatchUnknown(db: HausDatabase, id: string) {
    await db
        .update(agentDispatchesTable)
        .set({ state: 'unknown' })
        .where(and(eq(agentDispatchesTable.id, id), eq(agentDispatchesTable.state, 'accepted')));
}
