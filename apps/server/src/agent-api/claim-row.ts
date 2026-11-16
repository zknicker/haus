import { and, eq, inArray } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, type messageClaimsTable } from '../postgres/schema.ts';
import { type MessageRow, targetForChat, toAgentMessages } from './message-view.ts';
import { AgentTargetError } from './resolve-target.ts';

type ClaimRecord = typeof messageClaimsTable.$inferSelect;

export type AgentClaimRow = Awaited<ReturnType<typeof claimRows>>[number];

export async function claimRow(
    db: HausDatabase,
    runner: ResolvedRunner,
    messageRow: MessageRow,
    claim: ClaimRecord
) {
    const [row] = await claimRows(db, runner, [{ message: messageRow, claim }]);
    if (!row) {
        throw new Error('Claim projection lost its row.');
    }
    return row;
}

/** Projects many claims with a fixed number of reads, whatever the row count. */
export async function claimRows(
    db: HausDatabase,
    runner: ResolvedRunner,
    rows: Array<{ message: MessageRow; claim: ClaimRecord }>
) {
    if (rows.length === 0) {
        return [];
    }
    const messages = await toAgentMessages(
        db,
        runner.serverId,
        rows.map((row) => row.message)
    );
    const agentHandles = await agentHandlesById(
        db,
        runner.serverId,
        rows.flatMap((row) => row.claim.assigneeAgentId ?? [])
    );
    // Sequential: `db` is often the caller's transaction connection.
    const targets = new Map<string, string>();
    // A claim's target is the Chat its message sits in: the top-level Channel or
    // DM, or for a Thread claim its Thread (`dm:@x:<anchor>`), which also finds
    // the claim by number because a Thread target numbers through its parent.
    const chatIds = rows.map(({ claim }) => claim.threadChatId ?? claim.chatId);
    for (const chatId of new Set(chatIds)) {
        targets.set(chatId, await targetForChat(db, runner.serverId, chatId));
    }
    return rows.map(({ claim }, index) => ({
        assignee: claimAssignee(claim, agentHandles),
        message: messages[index] as (typeof messages)[number],
        number: claim.number,
        status: claim.status,
        target: targets.get(claim.threadChatId ?? claim.chatId) ?? '#unknown',
        version: claim.version,
    }));
}

function claimAssignee(claim: ClaimRecord, agentHandles: Map<string, string>) {
    if (claim.assigneeAgentId) {
        const handle = agentHandles.get(claim.assigneeAgentId);
        if (!handle) {
            throw new AgentTargetError('This Agent no longer exists.');
        }
        return { handle, id: claim.assigneeAgentId };
    }
    return null;
}

async function agentHandlesById(db: HausDatabase, serverId: string, ids: string[]) {
    if (ids.length === 0) {
        return new Map<string, string>();
    }
    const agents = await db
        .select({ handle: agentsTable.handle, id: agentsTable.id })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, serverId), inArray(agentsTable.id, [...new Set(ids)])));
    return new Map(agents.map((agent) => [agent.id, agent.handle]));
}

export async function agentHandle(
    db: HausDatabase,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>
) {
    const [agent] = await db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)));
    if (!agent) {
        throw new AgentTargetError('This Agent no longer exists.');
    }
    return agent.handle;
}

export function stripAt(value: string) {
    return value.startsWith('@') ? value.slice(1) : value;
}
