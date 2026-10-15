import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Payload } from '../src/linear/delivery-payload.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { linearWritesTable } from '../src/postgres/schema.ts';
import { desTeamId, type LinearSessionWorld } from './linear-session-seed.ts';
import { states } from './linear-trigger-seed.ts';

// Linear deliveries for `linear` Trigger tests, built from the real captures in
// fixtures/linear/captured/ and moved into the seeded workspace, plus ledger rows.

/** The captured Issue update, moved into the seeded workspace's DES team. */
export function issueDelivery(
    world: LinearSessionWorld,
    input: {
        action?: 'create' | 'update';
        actorId?: string;
        issueId?: string;
        labelIds?: string[];
        stateId?: string;
        updatedAt?: Date;
        updatedFrom?: Payload | null;
    }
): Payload {
    const body = captured('issue-update-state');
    const data = body.data as Payload;
    const at = input.updatedAt ?? new Date();
    return {
        ...body,
        action: input.action ?? 'update',
        actor: { id: input.actorId ?? 'human-1', name: 'Person', type: 'user' },
        data: {
            ...data,
            id: input.issueId ?? 'issue-142',
            identifier: 'DES-142',
            labelIds: input.labelIds ?? [],
            labels: (input.labelIds ?? []).map((id) => ({ id, name: id })),
            state: {
                id: input.stateId ?? states.changesRequested,
                name: 'Changes Requested',
                type: 'started',
            },
            stateId: input.stateId ?? states.changesRequested,
            team: { id: desTeamId, key: 'DES', name: 'Design' },
            teamId: desTeamId,
            updatedAt: at.toISOString(),
        },
        organizationId: world.organizationId,
        updatedFrom:
            input.updatedFrom === undefined
                ? { stateId: states.designReview, updatedAt: at.toISOString() }
                : input.updatedFrom,
        webhookTimestamp: at.getTime(),
    };
}

/** The captured mention comment, on a DES issue. */
export function commentDelivery(world: LinearSessionWorld, input: { issueId: string }): Payload {
    const body = captured('comment-create-mention');
    const data = body.data as Payload;
    return {
        ...body,
        data: {
            ...data,
            id: randomUUID(),
            issue: { ...(data.issue as Payload), id: input.issueId, teamId: desTeamId },
            issueId: input.issueId,
            updatedAt: new Date().toISOString(),
        },
        organizationId: world.organizationId,
    };
}

/** One ledger row, as the write ledger records a tool call. */
export async function ledgerWrite(
    db: HausDatabase,
    world: LinearSessionWorld,
    input: {
        agentId: string;
        clientEntityId?: string;
        createdAt: Date;
        status: 'pending' | 'succeeded';
        targetId?: string;
    }
) {
    await db.insert(linearWritesTable).values({
        agentId: input.agentId,
        clientEntityId: input.clientEntityId ?? null,
        completedAt: input.status === 'succeeded' ? input.createdAt : null,
        createdAt: input.createdAt,
        credentialId: world.credentialId,
        fieldFingerprint: '0'.repeat(64),
        id: createOpaqueId('lnl'),
        opIndex: 0,
        requestId: randomUUID(),
        result: input.status === 'succeeded' ? { ok: true } : null,
        serverId: world.serverId,
        status: input.status,
        targetId: input.targetId ?? null,
        targetType: 'issue',
        tool: 'update_issue',
        workspaceId: world.workspaceId,
    });
}

export function captured(name: string): Payload {
    const path = new URL(`./fixtures/linear/captured/${name}.json`, import.meta.url);
    return (JSON.parse(readFileSync(path, 'utf8')) as { body: Payload }).body;
}
