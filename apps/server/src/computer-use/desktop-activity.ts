import type { ComputerStewards, DesktopActivity } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { readOpenDesktopCommands } from '../agent-invocations/invocation-store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, serverMembershipsTable, usersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';

export class DesktopDeviceMissingError extends Error {}

export async function readDesktopActivity(
    db: HausDatabase,
    member: HausUser | null,
    input: { computerId: string; serverId: string }
) {
    await requireDesktopDevice(db, member, input);
    const activity: DesktopActivity = { commands: await readOpenDesktopCommands(db, input) };
    return activity;
}

export async function readComputerStewards(
    db: HausDatabase,
    member: HausUser | null,
    input: { computerId: string; serverId: string }
) {
    await requireServerMembership(db, member, input.serverId);
    const [row] = await db
        .select({
            displayName: usersTable.displayName,
            handle: serverMembershipsTable.handle,
            inventory: computersTable.reportedInventory,
        })
        .from(computersTable)
        .innerJoin(usersTable, eq(usersTable.id, computersTable.attachedByUserId))
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, computersTable.serverId),
                eq(serverMembershipsTable.userId, computersTable.attachedByUserId)
            )
        )
        .where(
            and(
                eq(computersTable.serverId, input.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .limit(1);
    if (!row) {
        throw new DesktopDeviceMissingError('That Device is no longer attached.');
    }
    const stewards: ComputerStewards = {
        attacher: {
            displayName: row.displayName ?? row.handle ?? 'The person who attached it',
            handle: row.handle,
        },
        name: row.inventory?.name ?? null,
    };
    return stewards;
}

export async function requireDesktopDevice(
    db: HausDatabase,
    member: HausUser | null,
    input: { computerId: string; serverId: string }
) {
    await requireServerMembership(db, member, input.serverId);
    const [computer] = await db
        .select({ id: computersTable.id })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, input.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .limit(1);
    if (!computer) {
        throw new DesktopDeviceMissingError('That Device is no longer attached.');
    }
}
