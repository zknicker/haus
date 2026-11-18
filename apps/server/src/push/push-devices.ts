import type { PushRegisterDeviceInput } from '@haus/api';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { pushDevicesTable, serverMembershipsTable, serversTable } from '../postgres/schema.ts';
import type { PushDevice } from './push-sender.ts';

/**
 * Registers a device for a human. The token is the key, so registering a
 * token another human held moves it: one iPhone signs in as one human.
 */
export async function registerPushDevice(
    db: Pick<HausDatabase, 'insert'>,
    userId: string,
    input: PushRegisterDeviceInput
) {
    await db
        .insert(pushDevicesTable)
        .values({ ...input, userId })
        .onConflictDoUpdate({
            set: {
                bundleId: input.bundleId,
                environment: input.environment,
                lastError: null,
                updatedAt: sql`now()`,
                userId,
            },
            target: pushDevicesTable.token,
        });
}

/** Signing out forgets the device, but only for the human who holds it. */
export async function unregisterPushDevice(
    db: Pick<HausDatabase, 'delete'>,
    userId: string,
    token: string
) {
    await db
        .delete(pushDevicesTable)
        .where(and(eq(pushDevicesTable.token, token), eq(pushDevicesTable.userId, userId)));
}

export async function deletePushDevice(db: Pick<HausDatabase, 'delete'>, token: string) {
    await db.delete(pushDevicesTable).where(eq(pushDevicesTable.token, token));
}

export async function recordPushDeviceError(
    db: Pick<HausDatabase, 'update'>,
    token: string,
    error: string
) {
    await db
        .update(pushDevicesTable)
        .set({ lastError: error, updatedAt: sql`now()` })
        .where(eq(pushDevicesTable.token, token));
}

export async function listPushDevices(
    db: Pick<HausDatabase, 'select'>,
    userId: string
): Promise<PushDevice[]> {
    return await db
        .select({
            bundleId: pushDevicesTable.bundleId,
            environment: pushDevicesTable.environment,
            token: pushDevicesTable.token,
        })
        .from(pushDevicesTable)
        .where(eq(pushDevicesTable.userId, userId));
}

/**
 * Of `userIds`, the humans who can be pushed about `serverId`: a current
 * member of a live Server with at least one registered device.
 */
export async function readPushableMembers(
    db: Pick<HausDatabase, 'selectDistinct'>,
    serverId: string,
    userIds: readonly string[]
): Promise<string[]> {
    if (userIds.length === 0) {
        return [];
    }
    const rows = await db
        .selectDistinct({ userId: pushDevicesTable.userId })
        .from(pushDevicesTable)
        .innerJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.userId, pushDevicesTable.userId),
                eq(serverMembershipsTable.serverId, serverId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .innerJoin(serversTable, and(eq(serversTable.id, serverId), isNull(serversTable.deletedAt)))
        .where(inArray(pushDevicesTable.userId, [...userIds]));
    return rows.map((row) => row.userId);
}
