import type { DriveConflictAttention } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import * as store from '../src/agent-delivery/store.ts';
import { queueDriveConflict } from '../src/drive/conflict-item.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { agentDeliveryTable, agentInboxTable } from '../src/postgres/schema.ts';
import type { Seed } from './agent-inbox-harness.ts';

export function driveConflictFixture(db: HausDatabase) {
    return { conflictRows, queue, setChain, turnsOf };

    function queue(delivery: AgentDelivery, seed: Seed, attention: DriveConflictAttention) {
        return queueDriveConflict(db, delivery, {
            attention,
            recipientAgentId: attention.writer.agentId,
            serverId: seed.serverId,
        });
    }

    async function conflictRows(agentId: string) {
        return await db
            .select({
                chatId: agentInboxTable.chatId,
                dedupeKey: agentInboxTable.dedupeKey,
                mentioned: agentInboxTable.mentioned,
                runId: agentInboxTable.runId,
                state: agentInboxTable.state,
            })
            .from(agentInboxTable)
            .where(
                and(
                    eq(agentInboxTable.agentId, agentId),
                    eq(agentInboxTable.source, 'drive_conflict')
                )
            );
    }

    async function setChain(seed: Seed, turns: number) {
        await store.ensureDeliveryState(db, seed);
        await db
            .update(agentDeliveryTable)
            .set({ agentChainAdvancedAt: new Date(), agentChainTurns: turns })
            .where(eq(agentDeliveryTable.agentId, seed.agentId));
    }

    async function turnsOf(seed: Seed) {
        return (await store.readDeliveryState(db, seed.agentId))?.agentChainTurns;
    }
}

export function conflictOf(pushId: string, writer: DriveConflictAttention['writer']) {
    const attention: DriveConflictAttention = {
        files: [
            {
                copyPath: 'agents/ada/notes/launch.conflict-ada.md',
                currentAuthorHandle: 'tiny',
                currentRevisionId: 'rev_launch_head',
                outcome: 'kept_both',
                path: 'agents/ada/notes/launch.md',
                reason: 'same_lines',
            },
            {
                copyPath: null,
                currentAuthorHandle: 'tiny',
                currentRevisionId: 'rev_plan_head',
                outcome: 'kept_edit',
                path: 'haus/old-plan.md',
                reason: 'edit_over_delete',
            },
            {
                copyPath: null,
                currentAuthorHandle: null,
                currentRevisionId: null,
                outcome: 'refused',
                path: 'agents/tiny/notes.md',
                reason: 'FORBIDDEN',
            },
        ],
        id: `drive-conflict:${pushId}`,
        pushId,
        writer,
    };
    return attention;
}
