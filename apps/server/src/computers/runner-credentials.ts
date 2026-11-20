import { randomBytes } from 'node:crypto';
import {
    driveSyncRunnerCapability,
    manualRunnerCapability,
    type RunnerMintRequest,
    type RunnerRevokeRequest,
} from '@haus/api';
import { and, arrayContains, eq, gt, isNull, not } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentRunnerCredentialsTable,
    agentsTable,
    chatsTable,
    computersTable,
} from '../postgres/schema.ts';
import { ComputerSetupDeniedError, hashComputerSecret } from './service.ts';

export interface ResolvedRunner {
    agentId: string;
    capabilities: string[];
    /** The launch Chat; null for a chatless run. */
    chatId: string | null;
    /** The minting Computer; null for a run credential the Server minted for the runner. */
    computerId: string | null;
    runId: string;
    runnerId: string;
    serverId: string;
}

const runnerLifetimeMs = 12 * 60 * 60 * 1000;
const driveSyncLifetimeMs = 15 * 60 * 1000;

/**
 * Mints one scoped runner credential for an Agent launch. The caller proves the
 * Computer credential; the credential is bound to one Agent and run on one
 * Server. The launch chat is retained as context while Agent API routes resolve
 * every product target and access under that same Agent/Server authority.
 */
export async function mintRunnerCredential(db: HausDatabase, input: RunnerMintRequest) {
    const computer = await requireComputer(db, input.credentialHash);

    const [agent] = await db
        .select({ computerId: agentsTable.computerId })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, computer.serverId),
                eq(agentsTable.id, input.agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!agent || agent.computerId !== computer.id) {
        throw new ComputerSetupDeniedError('That Agent is not assigned to this Computer.');
    }

    if (input.chatId !== null) {
        await requireChat(db, computer.serverId, input.chatId);
    }

    return await insertRunnerCredential(
        db,
        {
            agentId: input.agentId,
            chatId: input.chatId,
            computerId: computer.id,
            runId: input.runId,
            serverId: computer.serverId,
        },
        input.purpose
    );
}

/**
 * Mints the run credential the Server hands the runner in `runner-start`. No
 * Computer proves it, so it binds no Computer; it dies with the run like any other.
 */
export async function mintServerRunCredential(
    db: HausDatabase,
    input: { agentId: string; chatId: string | null; runId: string; serverId: string }
) {
    const { runnerToken } = await insertRunnerCredential(db, { ...input, computerId: null });
    return runnerToken;
}

/**
 * The machine a run's Computer-scoped work belongs to: the minting Computer, or
 * for a Server-minted run credential the Agent's assigned Computer.
 */
export async function readRunnerMachineId(db: HausDatabase, runner: ResolvedRunner) {
    if (runner.computerId) {
        return runner.computerId;
    }
    const [agent] = await db
        .select({ computerId: agentsTable.computerId })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)))
        .limit(1);
    if (!agent?.computerId) {
        throw new ComputerSetupDeniedError('This Agent has no assigned Computer.');
    }
    return agent.computerId;
}

/** Revokes a runner credential at launch end. Idempotent for an already-gone row. */
export async function revokeRunnerCredential(db: HausDatabase, input: RunnerRevokeRequest) {
    const computer = await requireComputer(db, input.credentialHash);
    await db
        .update(agentRunnerCredentialsTable)
        .set({ revokedAt: new Date() })
        .where(
            and(
                eq(agentRunnerCredentialsTable.id, input.runnerId),
                eq(agentRunnerCredentialsTable.computerId, computer.id),
                isNull(agentRunnerCredentialsTable.revokedAt)
            )
        );
    return { revoked: true };
}

/**
 * Revokes every live runner credential for one run. A human Stop calls this
 * durably, so the credential dies even when the Computer is offline: a Computer
 * that never got the Stop frame — or that restarts and re-runs the killed turn —
 * can no longer speak as the Agent, and the Stop stays effective. A drive-sync
 * credential stays: it reaches only Drive, expires on its own, and its push may
 * still be landing the run's edits.
 */
export async function revokeRunnerCredentialsForRun(
    db: HausDatabase,
    input: { agentId: string; runId: string; serverId: string }
): Promise<void> {
    await db
        .update(agentRunnerCredentialsTable)
        .set({ revokedAt: new Date() })
        .where(
            and(
                eq(agentRunnerCredentialsTable.serverId, input.serverId),
                eq(agentRunnerCredentialsTable.agentId, input.agentId),
                eq(agentRunnerCredentialsTable.runId, input.runId),
                isNull(agentRunnerCredentialsTable.revokedAt),
                not(
                    arrayContains(agentRunnerCredentialsTable.capabilities, [
                        driveSyncRunnerCapability,
                    ])
                )
            )
        );
}

/** Resolves a runner token to its bound Agent, launch chat, and Server. Fails closed. */
export async function resolveRunnerCredential(
    db: HausDatabase,
    token: string
): Promise<ResolvedRunner | null> {
    const [row] = await db
        .select({
            agentId: agentRunnerCredentialsTable.agentId,
            chatId: agentRunnerCredentialsTable.chatId,
            capabilities: agentRunnerCredentialsTable.capabilities,
            computerId: agentRunnerCredentialsTable.computerId,
            runId: agentRunnerCredentialsTable.runId,
            runnerId: agentRunnerCredentialsTable.id,
            serverId: agentRunnerCredentialsTable.serverId,
        })
        .from(agentRunnerCredentialsTable)
        .where(
            and(
                eq(agentRunnerCredentialsTable.tokenHash, hashComputerSecret(token)),
                isNull(agentRunnerCredentialsTable.revokedAt),
                gt(agentRunnerCredentialsTable.expiresAt, new Date())
            )
        )
        .limit(1);
    return row ?? null;
}

async function insertRunnerCredential(
    db: HausDatabase,
    input: {
        agentId: string;
        chatId: string | null;
        computerId: string | null;
        runId: string;
        serverId: string;
    },
    purpose: RunnerMintRequest['purpose'] = 'run'
) {
    const driveSync = purpose === 'drive-sync';
    const runnerToken = `grtr_${randomBytes(32).toString('base64url')}`;
    const runnerId = createOpaqueId('arc');
    await db.insert(agentRunnerCredentialsTable).values({
        ...input,
        capabilities: [driveSync ? driveSyncRunnerCapability : manualRunnerCapability],
        expiresAt: new Date(Date.now() + (driveSync ? driveSyncLifetimeMs : runnerLifetimeMs)),
        id: runnerId,
        tokenHash: hashComputerSecret(runnerToken),
    });
    return { runnerId, runnerToken };
}

async function requireChat(db: HausDatabase, serverId: string, chatId: string) {
    const [chat] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    if (!chat) {
        throw new ComputerSetupDeniedError('That collaboration chat does not exist.');
    }
}

async function requireComputer(db: HausDatabase, credentialHash: string) {
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
