import type {
    GithubTriggerConfigInput,
    Trigger,
    TriggerFire,
    TriggerStatus,
    WebhookTrigger,
} from '@haus/api';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { GithubApiTransport } from '../github/github-api.ts';
import type { LinearTriggerConfigAuthoring } from '../linear/trigger-references.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverMembershipsTable, triggersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { updateGithubTriggerRow } from './github-trigger-writes.ts';
import type { LinearAuthoringDependencies } from './linear-trigger-config.ts';
import { updateLinearTriggerRow } from './linear-trigger-writes.ts';
import {
    TriggerAccessDeniedError,
    type TriggerClock,
    TriggerRequestRefusedError,
} from './trigger-model.ts';
import type { TriggerProblemEntered } from './trigger-problem-arm.ts';
import { listTriggerFires, readTrigger, triggerRows, viewTrigger } from './trigger-queries.ts';
import {
    deleteTriggerRow,
    rotateTriggerSecretRow,
    setTriggerStatusRow,
    updateTriggerRow,
} from './trigger-writes.ts';

/**
 * The operator surface behind the Agent profile. Triggers are operator state:
 * only a Server Owner or Admin may read or change them, and the row work is the
 * same core the Agent path uses.
 */

/** What `github` and `linear` authoring reach outside Haus with. */
export interface TriggerAuthoringServices {
    githubTransport: GithubApiTransport;
    linear: LinearAuthoringDependencies;
}

export interface OperatorTriggerInput {
    origin: string;
    serverId: string;
    triggerId: string;
}

/** Triggers are operator state: only a Server Owner or Admin may read or change them. */
export async function requireTriggerOperator(
    db: Pick<HausDatabase, 'select'>,
    member: HausUser | null,
    serverId: string
) {
    const server = await requireServerMembership(db, member, serverId);
    if (!member || (server.role !== 'owner' && server.role !== 'admin')) {
        throw new TriggerAccessDeniedError();
    }
    return member;
}

/** The operator's own Server handle, used to name who sent a test fire. */
export async function readOperatorHandle(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string; userId: string }
): Promise<string | null> {
    const [membership] = await db
        .select({ handle: serverMembershipsTable.handle })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, input.serverId),
                eq(serverMembershipsTable.userId, input.userId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .limit(1);
    return membership?.handle ?? null;
}

export async function listOperatorTriggers(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId?: string; origin: string; serverId: string; status?: TriggerStatus }
): Promise<Trigger[]> {
    await requireTriggerOperator(db, member, input.serverId);
    const rows = await triggerRows(db)
        .where(
            and(
                eq(triggersTable.serverId, input.serverId),
                input.agentId ? eq(triggersTable.ownerAgentId, input.agentId) : undefined,
                input.status ? eq(triggersTable.status, input.status) : undefined,
                isNull(triggersTable.deletedAt)
            )
        )
        .orderBy(asc(triggersTable.createdAt), asc(triggersTable.id));
    return rows.map((row) => viewTrigger(row, input.origin));
}

export async function listOperatorTriggerRuns(
    db: HausDatabase,
    member: HausUser | null,
    input: OperatorTriggerInput
): Promise<TriggerFire[]> {
    await requireTriggerOperator(db, member, input.serverId);
    await readTrigger(db, input);
    return await listTriggerFires(db, {
        limit: 100,
        serverId: input.serverId,
        triggerId: input.triggerId,
    });
}

/**
 * The App's arm/disable switch. Setting the status it already has is a no-op.
 * `entered` names problem notices that arming queued, for the caller to wake.
 */
export async function setOperatorTriggerStatus(
    db: HausDatabase,
    member: HausUser | null,
    input: OperatorTriggerInput & { status: TriggerStatus },
    clock: TriggerClock
): Promise<{ entered: TriggerProblemEntered[]; trigger: Trigger }> {
    return await setTriggerStatusRow(db, input, operatorCheck(member, input), clock);
}

/**
 * Edits the title and standing instruction, and for a `github` Trigger its
 * configuration. The anchor and kind never move.
 */
export async function updateOperatorTrigger(
    db: HausDatabase,
    member: HausUser | null,
    input: OperatorTriggerInput & {
        github?: GithubTriggerConfigInput;
        instruction?: string | null;
        linear?: LinearTriggerConfigAuthoring;
        title?: string;
    },
    clock: TriggerClock,
    services: TriggerAuthoringServices
): Promise<{ trigger: Trigger }> {
    if (input.github !== undefined && input.linear !== undefined) {
        throw new TriggerRequestRefusedError(
            'trigger_kind_mismatch',
            'A Trigger is either GitHub or Linear; send one configuration.'
        );
    }
    if (input.linear !== undefined) {
        await requireTriggerOperator(db, member, input.serverId);
        return {
            trigger: await updateLinearTriggerRow(
                services.linear,
                { ...input, linear: input.linear },
                operatorCheck(member, input),
                clock
            ),
        };
    }
    if (input.github !== undefined) {
        await requireTriggerOperator(db, member, input.serverId);
        return {
            trigger: await updateGithubTriggerRow(
                { db, transport: services.githubTransport },
                { ...input, github: input.github },
                operatorCheck(member, input),
                clock
            ),
        };
    }
    return { trigger: await updateTriggerRow(db, input, operatorCheck(member, input), clock) };
}

/** Mints a replacement secret. The response is the only place it is readable. */
export async function rotateOperatorTriggerSecret(
    db: HausDatabase,
    member: HausUser | null,
    input: OperatorTriggerInput,
    clock: TriggerClock
): Promise<{ secret: string; trigger: WebhookTrigger }> {
    return await rotateTriggerSecretRow(db, input, operatorCheck(member, input), clock);
}

/** Removes the trigger from active use while retaining its recent fire history. */
export async function deleteOperatorTrigger(
    db: HausDatabase,
    member: HausUser | null,
    input: OperatorTriggerInput,
    clock: TriggerClock
): Promise<{ deleted: true; id: string }> {
    await deleteTriggerRow(db, input, operatorCheck(member, input), clock);
    return { deleted: true, id: input.triggerId };
}

function operatorCheck(member: HausUser | null, input: { serverId: string }) {
    return async (tx: HausDatabase) => await requireTriggerOperator(tx, member, input.serverId);
}
