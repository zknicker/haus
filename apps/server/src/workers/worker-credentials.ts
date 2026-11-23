import { createHash, randomBytes } from 'node:crypto';
import type {
    WorkerPushCredentialRequest,
    WorkerPushCredentialResponse,
    WorkerTurnCredentialRequest,
    WorkerTurnCredentialResponse,
} from '@haus/api';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ComputerSetupDeniedError } from '../computers/service.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    computersTable,
    workerTurnCredentialsTable,
    workerTurnsTable,
    workersTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { hasEarlierHarnessStop } from './harness-stop.ts';
import { currentTurnAttempt } from './worker-turn-attempt.ts';

type CredentialKind = 'push' | 'turn';

const credentialLifetimeMs = 12 * 60 * 60 * 1000;

export async function mintWorkerTurnCredential(
    db: HausDatabase,
    input: WorkerTurnCredentialRequest
) {
    const { serverId } = await requireComputer(db, input.credentialHash);
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, serverId);
        const computer = await requireComputer(tx, input.credentialHash);
        const found = await readDispatchedTurn(tx, computer, input.turnId);
        const refuse = (
            reason: Extract<WorkerTurnCredentialResponse, { state: 'refused' }>['reason']
        ) =>
            ({
                reason,
                state: 'refused',
                turnId: input.turnId,
            }) satisfies WorkerTurnCredentialResponse;
        if (!found) {
            return refuse('not-dispatched-here');
        }
        const { turn, worker } = found;
        if (turn.outcome) {
            return refuse('settled');
        }
        if (turn.stopRequestedAt) {
            return refuse('stop-requested');
        }
        if (currentTurnAttempt(turn) !== input.attempt) {
            return refuse('stale-attempt');
        }
        if (await hasEarlierHarnessStop(tx, turn)) {
            return refuse('earlier-turn-stopping');
        }
        if (worker.closingAt || worker.closedAt) {
            return refuse('closing');
        }
        if (worker.place === 'computer' && !computer.workersEnabled) {
            return refuse('place-off');
        }
        const minted = await mint(tx, {
            attempt: input.attempt,
            kind: 'turn',
            serverId: computer.serverId,
            turnId: turn.id,
        });
        return {
            attempt: input.attempt,
            ...minted,
            state: 'minted',
            turnId: turn.id,
        } satisfies WorkerTurnCredentialResponse;
    });
}

export async function mintWorkerPushCredential(
    db: HausDatabase,
    input: WorkerPushCredentialRequest
) {
    const computer = await requireComputer(db, input.credentialHash);
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, computer.serverId);
        const found = await readDispatchedTurn(tx, computer, input.turnId);
        if (!found) {
            return {
                reason: 'not-dispatched-here',
                state: 'refused',
                turnId: input.turnId,
            } satisfies WorkerPushCredentialResponse;
        }
        const minted = await mint(tx, {
            attempt: Math.max(1, currentTurnAttempt(found.turn)),
            kind: 'push',
            serverId: computer.serverId,
            turnId: found.turn.id,
        });
        return {
            ...minted,
            state: 'minted',
            turnId: found.turn.id,
        } satisfies WorkerPushCredentialResponse;
    });
}

export async function resolveWorkerCredential(
    db: Pick<HausDatabase, 'select'>,
    token: string,
    now = new Date()
) {
    const [row] = await db
        .select({
            credential: workerTurnCredentialsTable,
            turn: workerTurnsTable,
            worker: workersTable,
        })
        .from(workerTurnCredentialsTable)
        .innerJoin(
            workerTurnsTable,
            and(
                eq(workerTurnsTable.serverId, workerTurnCredentialsTable.serverId),
                eq(workerTurnsTable.id, workerTurnCredentialsTable.turnId)
            )
        )
        .innerJoin(
            workersTable,
            and(
                eq(workersTable.serverId, workerTurnsTable.serverId),
                eq(workersTable.id, workerTurnsTable.workerId)
            )
        )
        .where(eq(workerTurnCredentialsTable.tokenHash, hashWorkerToken(token)))
        .limit(1);
    if (!row) {
        return null;
    }
    const { credential, turn, worker } = row;
    return {
        agentId: worker.agentId,
        attempt: credential.attempt,
        computerId: worker.carrierComputerId,
        kind: credential.kind,
        live: credential.revokedAt === null && credential.expiresAt > now,
        serverId: credential.serverId,
        taskId: worker.taskId,
        turnId: turn.id,
        workerId: worker.id,
    };
}
export type WorkerCredentialScope = NonNullable<
    Awaited<ReturnType<typeof resolveWorkerCredential>>
>;

export async function revokeTurnCredentials(
    tx: Pick<HausDatabase, 'update'>,
    serverId: string,
    turnIds: readonly string[]
) {
    if (turnIds.length === 0) {
        return;
    }
    await tx
        .update(workerTurnCredentialsTable)
        .set({ revokedAt: sql`now()` })
        .where(
            and(
                eq(workerTurnCredentialsTable.serverId, serverId),
                inArray(workerTurnCredentialsTable.turnId, [...turnIds]),
                isNull(workerTurnCredentialsTable.revokedAt)
            )
        );
}

export function hashWorkerToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
}

async function mint(
    tx: HausDatabase,
    input: { attempt: number; kind: CredentialKind; serverId: string; turnId: string }
) {
    await tx
        .update(workerTurnCredentialsTable)
        .set({ revokedAt: sql`now()` })
        .where(
            and(
                eq(workerTurnCredentialsTable.serverId, input.serverId),
                eq(workerTurnCredentialsTable.turnId, input.turnId),
                eq(workerTurnCredentialsTable.kind, input.kind),
                eq(workerTurnCredentialsTable.attempt, input.attempt),
                isNull(workerTurnCredentialsTable.revokedAt)
            )
        );
    const token = `${input.kind === 'turn' ? 'hwt' : 'hwp'}_${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + credentialLifetimeMs);
    await tx.insert(workerTurnCredentialsTable).values({
        attempt: input.attempt,
        expiresAt,
        kind: input.kind,
        serverId: input.serverId,
        tokenHash: hashWorkerToken(token),
        turnId: input.turnId,
    });
    return { expiresAt: expiresAt.toISOString(), token };
}

async function readDispatchedTurn(
    tx: HausDatabase,
    computer: { id: string; serverId: string },
    turnId: string
) {
    const [row] = await tx
        .select({ turn: workerTurnsTable, worker: workersTable })
        .from(workerTurnsTable)
        .innerJoin(
            workersTable,
            and(
                eq(workersTable.serverId, workerTurnsTable.serverId),
                eq(workersTable.id, workerTurnsTable.workerId)
            )
        )
        .where(
            and(eq(workerTurnsTable.serverId, computer.serverId), eq(workerTurnsTable.id, turnId))
        )
        .limit(1);
    return row?.worker.carrierComputerId === computer.id && row.turn.dispatchedAt ? row : null;
}

async function requireComputer(db: HausDatabase, credentialHash: string) {
    const [computer] = await db
        .select({
            id: computersTable.id,
            serverId: computersTable.serverId,
            workersEnabled: computersTable.workersEnabled,
        })
        .from(computersTable)
        .where(eq(computersTable.credentialHash, credentialHash))
        .limit(1);
    if (!computer) {
        throw new ComputerSetupDeniedError('Computer credential was rejected.');
    }
    return computer;
}
