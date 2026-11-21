import { and, desc, eq, lt, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    computersTable,
    computerUseRequestsTable,
    serverMembershipsTable,
    usersTable,
} from '../postgres/schema.ts';

export type ComputerUseRequestRow = typeof computerUseRequestsTable.$inferSelect;

type Reader = Pick<HausDatabase, 'select'>;

const detailMaxLength = 200;

export async function readComputerUseDevice(
    db: Reader,
    input: { computerId: string; serverId: string }
) {
    const [computer] = await db
        .select({
            access: computersTable.computerUseAccess,
            inventory: computersTable.reportedInventory,
        })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, input.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .limit(1);
    if (!computer) {
        return null;
    }
    return { access: computer.access, name: computer.inventory?.name ?? null };
}

export async function hasComputerUseApproval(
    db: Reader,
    input: { chatId: string; computerId: string; serverId: string }
) {
    const [allowed] = await db
        .select({ id: computerUseRequestsTable.id })
        .from(computerUseRequestsTable)
        .where(
            and(
                eq(computerUseRequestsTable.serverId, input.serverId),
                eq(computerUseRequestsTable.chatId, input.chatId),
                eq(computerUseRequestsTable.computerId, input.computerId),
                eq(computerUseRequestsTable.state, 'allowed')
            )
        )
        .limit(1);
    return allowed !== undefined;
}

export async function openComputerUseRequest(
    db: Pick<HausDatabase, 'insert'>,
    input: {
        agentId: string;
        args: readonly string[];
        chatId: string;
        computerId: string;
        runId: string;
        serverId: string;
        toolCallId: string;
    }
) {
    const [command = '', ...rest] = input.args;
    const [created] = await db
        .insert(computerUseRequestsTable)
        .values({
            agentId: input.agentId,
            chatId: input.chatId,
            command,
            computerId: input.computerId,
            detail: rest.join(' ').slice(0, detailMaxLength),
            id: createOpaqueId('cur'),
            runId: input.runId,
            serverId: input.serverId,
            state: 'requested',
            toolCallId: input.toolCallId,
        })
        .onConflictDoNothing()
        .returning({ id: computerUseRequestsTable.id });
    return created ?? null;
}

export async function readChatComputerUseRequests(
    db: Reader,
    input: { chatId: string; serverId: string }
) {
    const attacher = alias(usersTable, 'attacher');
    const attacherMembership = alias(serverMembershipsTable, 'attacher_membership');
    const decider = alias(usersTable, 'decider');
    const deciderMembership = alias(serverMembershipsTable, 'decider_membership');
    return await db
        .select({
            attachedByUserId: computersTable.attachedByUserId,
            attacherName: sql<
                string | null
            >`coalesce(${attacher.displayName}, ${attacherMembership.handle})`,
            computerInventory: computersTable.reportedInventory,
            decidedByName: sql<
                string | null
            >`coalesce(${decider.displayName}, ${deciderMembership.handle})`,
            request: computerUseRequestsTable,
        })
        .from(computerUseRequestsTable)
        .innerJoin(
            computersTable,
            and(
                eq(computersTable.serverId, computerUseRequestsTable.serverId),
                eq(computersTable.id, computerUseRequestsTable.computerId)
            )
        )
        .leftJoin(attacher, eq(attacher.id, computersTable.attachedByUserId))
        .leftJoin(
            attacherMembership,
            and(
                eq(attacherMembership.serverId, computersTable.serverId),
                eq(attacherMembership.userId, computersTable.attachedByUserId)
            )
        )
        .leftJoin(decider, eq(decider.id, computerUseRequestsTable.decidedByUserId))
        .leftJoin(
            deciderMembership,
            and(
                eq(deciderMembership.serverId, computerUseRequestsTable.serverId),
                eq(deciderMembership.userId, computerUseRequestsTable.decidedByUserId)
            )
        )
        .where(
            and(
                eq(computerUseRequestsTable.serverId, input.serverId),
                eq(computerUseRequestsTable.chatId, input.chatId)
            )
        )
        .orderBy(desc(computerUseRequestsTable.requestedAt), desc(computerUseRequestsTable.id));
}

export async function deleteExpiredComputerUseRequests(db: HausDatabase, cutoff: Date) {
    await db
        .delete(computerUseRequestsTable)
        .where(
            and(
                ne(computerUseRequestsTable.state, 'allowed'),
                lt(computerUseRequestsTable.requestedAt, cutoff)
            )
        );
}

export async function readPersonName(db: Reader, input: { serverId: string; userId: string }) {
    const [row] = await db
        .select({
            name: sql<
                string | null
            >`coalesce(${usersTable.displayName}, ${serverMembershipsTable.handle})`,
        })
        .from(usersTable)
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.userId, usersTable.id),
                eq(serverMembershipsTable.serverId, input.serverId)
            )
        )
        .where(eq(usersTable.id, input.userId))
        .limit(1);
    return row?.name ?? null;
}
