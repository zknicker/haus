import type { GithubTrigger, GithubTriggerConfigInput, Trigger } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { githubTriggerConfigsTable, triggersTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import {
    type GithubAuthoringDependencies,
    lookupGithubRepositories,
    validateGithubTriggerConfig,
} from './github-trigger-config.ts';
import { type TriggerClock, TriggerRequestRefusedError } from './trigger-model.ts';
import { readTrigger } from './trigger-queries.ts';
import type { TriggerAnchor, TriggerAuthorization } from './trigger-writes.ts';

/**
 * Row writes for `github` Triggers, shared by the Agent and operator paths.
 * Repository names resolve against GitHub before the transaction; every other
 * check runs inside it, behind the Server lock, so the cap holds under races.
 */

export interface CreateGithubTriggerRowInput {
    /** The human who created it, or null when the owning Agent created it itself. */
    createdByUserId: string | null;
    github: GithubTriggerConfigInput;
    instruction: string | null;
    origin: string;
    ownerAgentId: string;
    serverId: string;
    title: string;
}

/** Creates one armed `github` Trigger. It has no secret and no URL. */
export async function createGithubTriggerRow(
    dependencies: GithubAuthoringDependencies,
    input: CreateGithubTriggerRowInput,
    resolveAnchor: (tx: HausDatabase, triggerId: string) => Promise<TriggerAnchor>,
    clock: TriggerClock
): Promise<{ event: PreparedRealtimeEvent | null; trigger: GithubTrigger }> {
    const repositories = await lookupGithubRepositories(dependencies, {
        config: input.github,
        serverId: input.serverId,
    });
    const now = clock.now();
    const triggerId = createOpaqueId('trg');
    return await dependencies.db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const anchor = await resolveAnchor(tx, triggerId);
        const config = await validateGithubTriggerConfig(tx, {
            config: input.github,
            editingTriggerId: null,
            now,
            ownerAgentId: input.ownerAgentId,
            repositories,
            serverId: input.serverId,
        });
        await tx.insert(triggersTable).values({
            anchorChatId: anchor.chatId,
            anchorMessageId: anchor.messageId,
            createdAt: now,
            createdByUserId: input.createdByUserId,
            id: triggerId,
            instruction: input.instruction,
            kind: 'github',
            ownerAgentId: input.ownerAgentId,
            secretHash: null,
            serverId: input.serverId,
            status: 'armed',
            title: input.title.trim(),
            updatedAt: now,
        });
        await tx
            .insert(githubTriggerConfigsTable)
            .values({ ...config, serverId: input.serverId, triggerId });
        return {
            event: anchor.event ?? null,
            trigger: requireGithubTrigger(
                await readTrigger(tx, { origin: input.origin, serverId: input.serverId, triggerId })
            ),
        };
    });
}

/**
 * Replaces a `github` Trigger's configuration, and its title or instruction
 * when given. A validated configuration clears any standing problem: the edit
 * is the fix. The anchor, owner, and kind never move.
 */
export async function updateGithubTriggerRow(
    dependencies: GithubAuthoringDependencies,
    input: {
        github: GithubTriggerConfigInput;
        instruction?: string | null;
        origin: string;
        serverId: string;
        title?: string;
        triggerId: string;
    },
    authorize: TriggerAuthorization,
    clock: TriggerClock
): Promise<Trigger> {
    const repositories = await lookupGithubRepositories(dependencies, {
        config: input.github,
        serverId: input.serverId,
    });
    const now = clock.now();
    return await dependencies.db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await authorize(tx);
        const current = requireGithubTrigger(await readTrigger(tx, input));
        const config = await validateGithubTriggerConfig(tx, {
            config: input.github,
            editingTriggerId: current.id,
            now,
            ownerAgentId: current.ownerAgentId,
            repositories,
            serverId: input.serverId,
        });
        await tx
            .update(githubTriggerConfigsTable)
            .set(config)
            .where(
                and(
                    eq(githubTriggerConfigsTable.serverId, input.serverId),
                    eq(githubTriggerConfigsTable.triggerId, current.id)
                )
            );
        await tx
            .update(triggersTable)
            .set({
                ...(input.title === undefined ? {} : { title: input.title.trim() }),
                ...(input.instruction === undefined
                    ? {}
                    : { instruction: input.instruction?.trim() || null }),
                updatedAt: now,
                version: current.version + 1,
            })
            .where(
                and(eq(triggersTable.serverId, input.serverId), eq(triggersTable.id, current.id))
            );
        return await readTrigger(tx, input);
    });
}

/** Narrows to a `github` Trigger, the only kind with a GitHub configuration. */
export function requireGithubTrigger(trigger: Trigger): GithubTrigger {
    if (trigger.kind !== 'github') {
        throw new TriggerRequestRefusedError(
            'trigger_kind_mismatch',
            `A ${trigger.kind === 'linear' ? 'Linear' : 'webhook'} Trigger has no GitHub configuration to change.`
        );
    }
    return trigger;
}
