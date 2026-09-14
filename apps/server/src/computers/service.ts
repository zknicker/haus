import { createHash } from 'node:crypto';
import {
    type ComputerManagementEvent,
    type ComputerSystemEvent,
    type ComputerUpdateProgress,
    computerProtocolVersion,
} from '@haus/api';
import { and, desc, eq, gte, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentsTable,
    computerSystemEventsTable,
    computersTable,
    serverOnboardingTable,
} from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import type { ComputerHandshake } from './contracts.ts';

export class ComputerSetupDeniedError extends Error {
    readonly code?: 'computer_machine_unlinked';

    constructor(message: string, code?: 'computer_machine_unlinked') {
        super(message);
        this.code = code;
        this.name = 'ComputerSetupDeniedError';
    }
}

export function hashComputerSecret(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

export async function validateComputerCredential(
    db: HausDatabase,
    input: { credentialHash: string; serverId: string }
) {
    const [computer] = await db
        .select({ id: computersTable.id })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, input.serverId),
                eq(computersTable.credentialHash, input.credentialHash)
            )
        )
        .limit(1);
    if (!computer) {
        throw new ComputerSetupDeniedError(
            'Computer credential was rejected. Open the App to manage this attachment.',
            'computer_machine_unlinked'
        );
    }
    return computer;
}

export async function reportComputerHandshake(
    db: HausDatabase,
    computer: { id: string; serverId: string },
    handshake: ComputerHandshake
) {
    const { update, ...facts } = handshake;
    const compatible = handshake.protocolVersion === computerProtocolVersion;
    const connectedAt = new Date();
    const connectionGeneration = createOpaqueId('ccn');
    await db.transaction(async (tx) => {
        await tx
            .update(computersTable)
            .set({
                ...facts,
                connectionGeneration,
                health: compatible ? handshake.health : 'update-required',
                lastConnectedAt: connectedAt,
                updateDetail: update.detail,
                updateDownloadedBytes: update.downloadedBytes,
                updateFailedPhase: update.failedPhase,
                updatePhase: update.phase,
                updateActiveAgentCount: update.activeAgentCount,
                updateTargetVersion: update.targetVersion,
                updateTotalBytes: update.totalBytes,
                updateUpdatedAt: new Date(update.updatedAt),
            })
            .where(eq(computersTable.id, computer.id));
        await tx.insert(computerSystemEventsTable).values({
            computerId: computer.id,
            id: createOpaqueId('cse'),
            occurredAt: connectedAt,
            serverId: computer.serverId,
            type: 'connected',
        });
        await pruneComputerSystemEvents(tx, computer.id);
        await tx
            .update(serverOnboardingTable)
            .set({
                computerId: computer.id,
                failureCode: compatible ? null : 'computer-incompatible',
                failureDetail: compatible ? null : 'Update Haus Computer before continuing setup.',
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(serverOnboardingTable.serverId, computer.serverId),
                    ne(serverOnboardingTable.phase, 'complete'),
                    compatible
                        ? or(
                              isNull(serverOnboardingTable.failureCode),
                              ne(serverOnboardingTable.failureCode, 'application-failed')
                          )
                        : undefined,
                    or(
                        eq(serverOnboardingTable.phase, 'awaiting-computer'),
                        eq(serverOnboardingTable.computerId, computer.id)
                    )
                )
            );
    });
    return { ...computer, connectionGeneration };
}

export async function resolveComputerCredential(db: HausDatabase, credentialHash: string) {
    const [computer] = await db
        .select({ id: computersTable.id, serverId: computersTable.serverId })
        .from(computersTable)
        .where(eq(computersTable.credentialHash, credentialHash))
        .limit(1);
    if (!computer) {
        throw new ComputerSetupDeniedError('Computer credential was rejected.');
    }
    return computer;
}

export async function reportComputerUpdateProgress(
    db: HausDatabase,
    computerId: string,
    update: ComputerUpdateProgress
) {
    // Idle is the bootstrap baseline, not a live transition. Older Computers
    // without a progress file report a freshly timestamped idle snapshot on
    // every poll; accepting it would erase Server-owned check/request state.
    if (update.phase === 'idle') {
        return false;
    }
    await db
        .update(computersTable)
        .set({
            updateDetail: update.detail,
            updateDownloadedBytes: update.downloadedBytes,
            updateFailedPhase: update.failedPhase,
            updatePhase: update.phase,
            updateActiveAgentCount: update.activeAgentCount,
            updateTargetVersion: update.targetVersion,
            updateTotalBytes: update.totalBytes,
            updateUpdatedAt: new Date(update.updatedAt),
        })
        .where(eq(computersTable.id, computerId));
    return true;
}

export async function recordComputerManagementEvents(
    db: HausDatabase,
    computerId: string,
    serverId: string,
    events: ComputerManagementEvent[]
) {
    const latestAcceptedTime = Date.now() + 5 * 60_000;
    const acceptedEvents = events.filter(
        (event) => Date.parse(event.occurredAt) <= latestAcceptedTime
    );
    if (acceptedEvents.length === 0) {
        return;
    }
    await db.transaction(async (tx) => {
        await tx
            .insert(computerSystemEventsTable)
            .values(
                acceptedEvents.map((event) => ({
                    command: event.command,
                    computerId,
                    id: event.id,
                    occurredAt: new Date(event.occurredAt),
                    serverId,
                    type: event.type,
                }))
            )
            .onConflictDoNothing({ target: computerSystemEventsTable.id });
        await pruneComputerSystemEvents(tx, computerId);
    });
}

export async function markComputerOffline(
    db: HausDatabase,
    computerId: string,
    connectionGeneration: string,
    reason: Extract<ComputerSystemEvent, { type: 'disconnected' }>['reason']
) {
    await db.transaction(async (tx) => {
        const [computer] = await tx
            .update(computersTable)
            .set({ connectionGeneration: null, health: 'offline' })
            .where(
                and(
                    eq(computersTable.id, computerId),
                    eq(computersTable.connectionGeneration, connectionGeneration)
                )
            )
            .returning({ serverId: computersTable.serverId });
        if (!computer) {
            return;
        }
        await tx.insert(computerSystemEventsTable).values({
            computerId,
            id: createOpaqueId('cse'),
            occurredAt: new Date(),
            reason,
            serverId: computer.serverId,
            type: 'disconnected',
        });
        await pruneComputerSystemEvents(tx, computerId);
        await tx
            .update(serverOnboardingTable)
            .set({
                failureCode: 'computer-disconnected',
                failureDetail: 'The Computer disconnected. Run setup again on that Computer.',
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(serverOnboardingTable.serverId, computer.serverId),
                    eq(serverOnboardingTable.computerId, computerId),
                    ne(serverOnboardingTable.phase, 'complete'),
                    or(
                        isNull(serverOnboardingTable.failureCode),
                        ne(serverOnboardingTable.failureCode, 'application-failed')
                    )
                )
            );
    });
}

async function pruneComputerSystemEvents(
    db: Parameters<Parameters<HausDatabase['transaction']>[0]>[0],
    computerId: string
) {
    await db.execute(sql`
        delete from ${computerSystemEventsTable}
        where ${computerSystemEventsTable.computerId} = ${computerId}
          and ${computerSystemEventsTable.id} not in (
              select ${computerSystemEventsTable.id}
              from ${computerSystemEventsTable}
              where ${computerSystemEventsTable.computerId} = ${computerId}
              order by ${computerSystemEventsTable.occurredAt} desc,
                       ${computerSystemEventsTable.recordedAt} desc,
                       ${computerSystemEventsTable.id} desc
              limit 1000
          )
    `);
}

export async function recordInvalidComputerInventory(
    db: HausDatabase,
    computerId: string,
    serverId: string
) {
    await db
        .update(serverOnboardingTable)
        .set({
            computerId,
            failureCode: 'inventory-invalid',
            failureDetail: 'The Computer reported invalid inventory. Update it and reconnect.',
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(serverOnboardingTable.serverId, serverId),
                ne(serverOnboardingTable.phase, 'complete'),
                or(
                    eq(serverOnboardingTable.phase, 'awaiting-computer'),
                    eq(serverOnboardingTable.computerId, computerId)
                )
            )
        );
}

/** Process startup has no live attachment registry, so persisted online state is stale. */
export async function markAllComputersOffline(db: HausDatabase) {
    await db.transaction(async (tx) => {
        const connected = await tx
            .update(computersTable)
            .set({ connectionGeneration: null, health: 'offline' })
            .where(ne(computersTable.health, 'offline'))
            .returning({ id: computersTable.id, serverId: computersTable.serverId });
        if (connected.length > 0) {
            await tx.insert(computerSystemEventsTable).values(
                connected.map((computer) => ({
                    computerId: computer.id,
                    id: createOpaqueId('cse'),
                    occurredAt: new Date(),
                    reason: 'server-restarted' as const,
                    serverId: computer.serverId,
                    type: 'disconnected' as const,
                }))
            );
            for (const computer of connected) {
                await pruneComputerSystemEvents(tx, computer.id);
            }
        }
        await tx
            .update(serverOnboardingTable)
            .set({
                failureCode: 'computer-disconnected',
                failureDetail: 'The Computer disconnected. Run setup again on that Computer.',
                updatedAt: new Date(),
            })
            .where(
                and(
                    isNotNull(serverOnboardingTable.computerId),
                    ne(serverOnboardingTable.phase, 'complete'),
                    or(
                        isNull(serverOnboardingTable.failureCode),
                        ne(serverOnboardingTable.failureCode, 'application-failed')
                    )
                )
            );
    });
}

export async function listServerComputers(
    db: HausDatabase,
    member: HausUser | null,
    serverId: string
) {
    const server = await requireServerMembership(db, member, serverId);
    if (server.role !== 'owner' && server.role !== 'admin') {
        throw new ComputerSetupDeniedError('Only a Server Owner or Admin can view Computers.');
    }
    const computers = await db
        .select({
            architecture: computersTable.architecture,
            createdAt: computersTable.createdAt,
            health: computersTable.health,
            id: computersTable.id,
            lastConnectedAt: computersTable.lastConnectedAt,
            operatingSystem: computersTable.operatingSystem,
            productVersion: computersTable.productVersion,
            protocolVersion: computersTable.protocolVersion,
            reportedInventory: computersTable.reportedInventory,
            updateDetail: computersTable.updateDetail,
            updateDownloadedBytes: computersTable.updateDownloadedBytes,
            updateFailedPhase: computersTable.updateFailedPhase,
            updatePhase: computersTable.updatePhase,
            updateActiveAgentCount: computersTable.updateActiveAgentCount,
            updateTargetVersion: computersTable.updateTargetVersion,
            updateTotalBytes: computersTable.updateTotalBytes,
            updateUpdatedAt: computersTable.updateUpdatedAt,
        })
        .from(computersTable)
        .where(eq(computersTable.serverId, serverId))
        .orderBy(desc(computersTable.createdAt));
    return computers.map((computer) => ({
        ...computer,
        name: computer.reportedInventory?.name ?? null,
    }));
}

export async function listComputerSystemEvents(
    db: HausDatabase,
    member: HausUser | null,
    input: { computerId: string; page: number; serverId: string }
) {
    const server = await requireServerMembership(db, member, input.serverId);
    if (server.role !== 'owner' && server.role !== 'admin') {
        throw new ComputerSetupDeniedError('Only a Server Owner or Admin can view Computer logs.');
    }
    const pageSize = 6;
    const eventScope = and(
        eq(computerSystemEventsTable.serverId, input.serverId),
        eq(computerSystemEventsTable.computerId, input.computerId)
    );
    const [[countRow], [disconnectCountRow], events] = await Promise.all([
        db
            .select({ total: sql<number>`count(*)::int` })
            .from(computerSystemEventsTable)
            .where(eventScope),
        db
            .select({ total: sql<number>`count(*)::int` })
            .from(computerSystemEventsTable)
            .where(
                and(
                    eventScope,
                    eq(computerSystemEventsTable.type, 'disconnected'),
                    gte(computerSystemEventsTable.occurredAt, new Date(Date.now() - 5 * 60_000))
                )
            ),
        db
            .select({
                command: computerSystemEventsTable.command,
                id: computerSystemEventsTable.id,
                occurredAt: computerSystemEventsTable.occurredAt,
                reason: computerSystemEventsTable.reason,
                type: computerSystemEventsTable.type,
            })
            .from(computerSystemEventsTable)
            .where(eventScope)
            .orderBy(
                desc(computerSystemEventsTable.occurredAt),
                desc(computerSystemEventsTable.recordedAt),
                desc(computerSystemEventsTable.id)
            )
            .limit(pageSize)
            .offset((input.page - 1) * pageSize),
    ]);
    return {
        events: events.map((event): ComputerSystemEvent => {
            const occurredAt = event.occurredAt.toISOString();
            if (event.type === 'management-command' && event.command) {
                return { command: event.command, id: event.id, occurredAt, type: event.type };
            }
            if (event.type === 'disconnected' && event.reason) {
                return { id: event.id, occurredAt, reason: event.reason, type: event.type };
            }
            return { id: event.id, occurredAt, type: 'connected' };
        }),
        hasFrequentDisconnects: (disconnectCountRow?.total ?? 0) >= 5,
        page: input.page,
        pageSize,
        total: countRow?.total ?? 0,
    };
}

/** A Computer credential is deleted only after every assigned Agent is retired. */
export async function removeServerComputer(
    db: HausDatabase,
    member: HausUser | null,
    input: { computerId: string; confirmation: string; serverId: string }
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const server = await requireServerMembership(tx, member, input.serverId);
        if (!member || (server.role !== 'owner' && server.role !== 'admin')) {
            throw new ComputerSetupDeniedError(
                'Only a Server Owner or Admin can remove a Computer.'
            );
        }
        if (input.confirmation !== 'REMOVE') {
            throw new ComputerSetupDeniedError('Type REMOVE to remove this Computer.');
        }
        const [computer] = await tx
            .select({ id: computersTable.id })
            .from(computersTable)
            .where(
                and(
                    eq(computersTable.id, input.computerId),
                    eq(computersTable.serverId, input.serverId)
                )
            )
            .limit(1);
        if (!computer) {
            throw new ComputerSetupDeniedError('That Computer no longer exists.');
        }
        const [assigned] = await tx
            .select({ id: agentsTable.id })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.computerId, computer.id),
                    isNull(agentsTable.retiredAt)
                )
            )
            .limit(1);
        if (assigned) {
            throw new ComputerSetupDeniedError(
                'Delete every assigned Agent before removing this Computer.'
            );
        }
        await tx
            .update(serverOnboardingTable)
            .set({ computerId: null })
            .where(
                and(
                    eq(serverOnboardingTable.serverId, input.serverId),
                    eq(serverOnboardingTable.computerId, computer.id),
                    eq(serverOnboardingTable.phase, 'complete')
                )
            );
        await tx
            .update(serverOnboardingTable)
            .set({
                computerId: null,
                failureCode: null,
                failureDetail: null,
                phase: 'awaiting-computer',
            })
            .where(
                and(
                    eq(serverOnboardingTable.serverId, input.serverId),
                    eq(serverOnboardingTable.computerId, computer.id),
                    ne(serverOnboardingTable.phase, 'complete')
                )
            );
        await tx
            .update(agentsTable)
            .set({ computerId: null, desiredModelId: null, desiredRuntimeId: null })
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.computerId, computer.id)
                )
            );
        await tx.delete(computersTable).where(eq(computersTable.id, computer.id));
        return { computerId: computer.id };
    });
}
