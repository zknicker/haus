import type { AgentTrigger, AgentTriggerCreateInput, Trigger, TriggerStatus } from '@haus/api';
import type { FastifyRequest } from 'fastify';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { refuseGithubTriggers } from '../triggers/trigger-model.ts';
import {
    createTrigger,
    deleteTrigger,
    rotateTriggerSecret,
    setTriggerStatus,
} from '../triggers/trigger-mutations.ts';
import {
    listOwnedTriggers,
    listTriggerFires,
    readOwnedTrigger,
    readTriggerFire,
} from '../triggers/trigger-queries.ts';
import { publicOrigin, triggerCurlCommand } from '../triggers/trigger-url.ts';
import { resolveAgentMessage } from './message-read.ts';
import { targetForChat } from './message-view.ts';

const clock = { now: () => new Date() };

export async function createAgentTrigger(
    db: HausDatabase,
    runner: ResolvedRunner,
    request: FastifyRequest,
    input: AgentTriggerCreateInput
) {
    if (input.kind === 'github') {
        return refuseGithubTriggers();
    }
    const anchor = await resolveAgentMessage(db, runner, input.messageId);
    const created = await createTrigger(
        db,
        runner.agentId,
        {
            anchorChatId: anchor.chat_id,
            anchorMessageId: anchor.id,
            instruction: input.instruction ?? null,
            kind: input.kind,
            origin: publicOrigin(request),
            serverId: runner.serverId,
            title: input.title,
        },
        clock
    );
    const trigger = await toAgentTrigger(db, runner.serverId, created.trigger);
    return {
        curl: triggerCurlCommand(trigger.url, created.secret),
        secret: created.secret,
        trigger,
        url: trigger.url,
    };
}

export async function listAgentTriggers(
    db: HausDatabase,
    runner: ResolvedRunner,
    request: FastifyRequest
) {
    const triggers = await listOwnedTriggers(db, {
        agentId: runner.agentId,
        origin: publicOrigin(request),
        serverId: runner.serverId,
    });
    return {
        triggers: await Promise.all(
            triggers.map((trigger) => toAgentTrigger(db, runner.serverId, trigger))
        ),
    };
}

export async function readAgentTrigger(
    db: HausDatabase,
    runner: ResolvedRunner,
    request: FastifyRequest,
    triggerId: string
) {
    const trigger = await readOwnedTrigger(db, {
        agentId: runner.agentId,
        origin: publicOrigin(request),
        serverId: runner.serverId,
        triggerId,
    });
    return { trigger: await toAgentTrigger(db, runner.serverId, trigger) };
}

export async function setAgentTriggerStatus(
    db: HausDatabase,
    runner: ResolvedRunner,
    request: FastifyRequest,
    input: { status: TriggerStatus; triggerId: string }
) {
    const trigger = await setTriggerStatus(
        db,
        runner.agentId,
        {
            origin: publicOrigin(request),
            serverId: runner.serverId,
            status: input.status,
            triggerId: input.triggerId,
        },
        clock
    );
    return { trigger: await toAgentTrigger(db, runner.serverId, trigger) };
}

export async function rotateAgentTriggerSecret(
    db: HausDatabase,
    runner: ResolvedRunner,
    request: FastifyRequest,
    triggerId: string
) {
    const rotated = await rotateTriggerSecret(
        db,
        runner.agentId,
        { origin: publicOrigin(request), serverId: runner.serverId, triggerId },
        clock
    );
    const trigger = await toAgentTrigger(db, runner.serverId, rotated.trigger);
    return {
        curl: triggerCurlCommand(trigger.url, rotated.secret),
        secret: rotated.secret,
        trigger,
        url: trigger.url,
    };
}

export async function deleteAgentTrigger(
    db: HausDatabase,
    runner: ResolvedRunner,
    request: FastifyRequest,
    triggerId: string
) {
    await deleteTrigger(
        db,
        runner.agentId,
        {
            origin: publicOrigin(request),
            serverId: runner.serverId,
            triggerId,
        },
        clock
    );
    return { deleted: true as const, id: triggerId };
}

/** Fire history for one owned trigger, or one fire with its stored payload. */
export async function readAgentTriggerLog(
    db: HausDatabase,
    runner: ResolvedRunner,
    request: FastifyRequest,
    input: { fireId?: string; limit: number; triggerId: string }
) {
    await readOwnedTrigger(db, {
        agentId: runner.agentId,
        origin: publicOrigin(request),
        serverId: runner.serverId,
        triggerId: input.triggerId,
    });
    if (input.fireId) {
        return {
            fire: await readTriggerFire(db, {
                fireId: input.fireId,
                serverId: runner.serverId,
                triggerId: input.triggerId,
            }),
            kind: 'fire' as const,
        };
    }
    return {
        fires: await listTriggerFires(db, {
            limit: input.limit,
            serverId: runner.serverId,
            triggerId: input.triggerId,
        }),
        kind: 'fires' as const,
    };
}

/** Adds where the trigger is anchored; the kind, and so the variant, is kept. */
async function toAgentTrigger<T extends Trigger>(
    db: HausDatabase,
    serverId: string,
    trigger: T
): Promise<T & Pick<AgentTrigger, 'anchorTarget'>> {
    return {
        ...trigger,
        anchorTarget: await targetForChat(db, serverId, trigger.anchorChatId),
    };
}
