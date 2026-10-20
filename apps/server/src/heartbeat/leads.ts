import type { Lead, LeadClaimInput, LeadClaimResult, LeadListResponse } from '@haus/api';
import { and, desc, eq, gt, inArray, lt } from 'drizzle-orm';
import { resolveAgentMessage } from '../agent-api/message-read.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentLeadsTable, agentsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { HeartbeatRefusedError, LeadNotFoundError } from './heartbeat-errors.ts';

const day = 24 * 60 * 60 * 1000;
const claimWindowMs = 7 * day;
const retentionMs = 14 * day;
const listLimit = 50;
const sweepBatch = 100;

const leadColumns = {
    agentHandle: agentsTable.handle,
    agentId: agentLeadsTable.agentId,
    anchorChatId: agentLeadsTable.anchorChatId,
    anchorMessageId: agentLeadsTable.anchorMessageId,
    createdAt: agentLeadsTable.createdAt,
    doneAt: agentLeadsTable.doneAt,
    finding: agentLeadsTable.finding,
    id: agentLeadsTable.id,
    topic: agentLeadsTable.topic,
};

interface LeadRow {
    agentHandle: string;
    agentId: string;
    anchorChatId: string | null;
    anchorMessageId: string | null;
    createdAt: Date;
    doneAt: Date | null;
    finding: string | null;
    id: string;
    topic: string;
}

/**
 * Claims a topic for the calling Agent. A message another Agent claimed within the last
 * seven days is refused with who holds it; the Agent's own live claim on it is returned
 * unchanged. Rows past retention are swept in a bounded batch on the way.
 */
export async function claimLead(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: LeadClaimInput
): Promise<LeadClaimResult> {
    const anchor = input.messageId ? await resolveAgentMessage(db, runner, input.messageId) : null;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        await sweepExpiredLeads(tx, runner.serverId);
        if (anchor) {
            const rows = await readHolders(tx, runner.serverId, anchor.id);
            const other = rows.find((row) => row.agentId !== runner.agentId);
            if (other) {
                return {
                    claimed: false,
                    heldBy: { agentHandle: other.agentHandle, agentId: other.agentId },
                    leadId: other.id,
                };
            }
            const own = rows[0];
            if (own) {
                return { claimed: true, lead: toLead(own) };
            }
        }
        const id = createOpaqueId('led');
        await tx.insert(agentLeadsTable).values({
            agentId: runner.agentId,
            anchorChatId: anchor?.chat_id ?? null,
            anchorMessageId: anchor?.id ?? null,
            createdAt: new Date(),
            id,
            serverId: runner.serverId,
            topic: input.topic,
        });
        return { claimed: true, lead: toLead(await readLead(tx, runner.serverId, id)) };
    });
}

/** This Server's leads from the last seven days, newest first. */
export async function listLeads(
    db: HausDatabase,
    runner: ResolvedRunner
): Promise<LeadListResponse> {
    const rows = await db
        .select(leadColumns)
        .from(agentLeadsTable)
        .innerJoin(agentsTable, agentJoin())
        .where(
            and(
                eq(agentLeadsTable.serverId, runner.serverId),
                gt(agentLeadsTable.createdAt, new Date(Date.now() - claimWindowMs))
            )
        )
        .orderBy(desc(agentLeadsTable.createdAt), desc(agentLeadsTable.id))
        .limit(listLimit);
    return { leads: rows.map(toLead) };
}

/** Records the claiming Agent's finding; another Agent's lead is refused. */
export async function finishLead(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { finding: string; id: string }
): Promise<{ lead: Lead }> {
    const lead = await readLead(db, runner.serverId, input.id);
    if (lead.agentId !== runner.agentId) {
        throw new HeartbeatRefusedError(
            'LEAD_NOT_OWNED',
            `That lead belongs to @${lead.agentHandle}; only the claiming Agent can finish it.`
        );
    }
    await db
        .update(agentLeadsTable)
        .set({ doneAt: new Date(), finding: input.finding })
        .where(
            and(
                eq(agentLeadsTable.serverId, runner.serverId),
                eq(agentLeadsTable.id, input.id),
                eq(agentLeadsTable.agentId, runner.agentId)
            )
        );
    return { lead: toLead(await readLead(db, runner.serverId, input.id)) };
}

async function readHolders(db: HausDatabase, serverId: string, messageId: string) {
    return await db
        .select(leadColumns)
        .from(agentLeadsTable)
        .innerJoin(agentsTable, agentJoin())
        .where(
            and(
                eq(agentLeadsTable.serverId, serverId),
                eq(agentLeadsTable.anchorMessageId, messageId),
                gt(agentLeadsTable.createdAt, new Date(Date.now() - claimWindowMs))
            )
        )
        .orderBy(desc(agentLeadsTable.createdAt))
        .limit(20);
}

async function readLead(db: HausDatabase, serverId: string, id: string): Promise<LeadRow> {
    const [row] = await db
        .select(leadColumns)
        .from(agentLeadsTable)
        .innerJoin(agentsTable, agentJoin())
        .where(and(eq(agentLeadsTable.serverId, serverId), eq(agentLeadsTable.id, id)))
        .limit(1);
    if (!row) {
        throw new LeadNotFoundError();
    }
    return row;
}

async function sweepExpiredLeads(tx: HausDatabase, serverId: string) {
    const expired = tx
        .select({ id: agentLeadsTable.id })
        .from(agentLeadsTable)
        .where(
            and(
                eq(agentLeadsTable.serverId, serverId),
                lt(agentLeadsTable.createdAt, new Date(Date.now() - retentionMs))
            )
        )
        .limit(sweepBatch);
    await tx.delete(agentLeadsTable).where(inArray(agentLeadsTable.id, expired));
}

function agentJoin() {
    return and(
        eq(agentsTable.serverId, agentLeadsTable.serverId),
        eq(agentsTable.id, agentLeadsTable.agentId)
    );
}

function toLead(row: LeadRow): Lead {
    return {
        agentHandle: row.agentHandle,
        agentId: row.agentId,
        anchorChatId: row.anchorChatId,
        anchorMessageId: row.anchorMessageId,
        createdAt: row.createdAt.toISOString(),
        doneAt: row.doneAt?.toISOString() ?? null,
        finding: row.finding,
        id: row.id,
        topic: row.topic,
    };
}
