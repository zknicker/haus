import type {
    AgentTrigger,
    AgentTriggerCreateInput,
    AgentTriggerUpdateInput,
    GithubTriggerPreviewInput,
    LinearTriggerPreviewInput,
    Trigger,
    TriggerStatus,
} from '@haus/api';
import type { FastifyRequest } from 'fastify';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { previewGithubTrigger } from '../triggers/github-trigger-preview.ts';
import { previewLinearTrigger } from '../triggers/linear-trigger-preview.ts';
import type { TriggerAuthoringServices } from '../triggers/operator-triggers.ts';
import {
    createAgentGithubTrigger,
    createAgentLinearTrigger,
    createTrigger,
    deleteTrigger,
    rotateTriggerSecret,
    setTriggerStatus,
    updateAgentOwnedTrigger,
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

/** A GitHub body with its event name, or a raw Linear body; nothing fires. */
export async function previewAgentTrigger(
    db: HausDatabase,
    services: TriggerAuthoringServices,
    runner: ResolvedRunner,
    request: FastifyRequest,
    input: (GithubTriggerPreviewInput | LinearTriggerPreviewInput) & { triggerId: string }
) {
    const trigger = await readOwnedTrigger(db, {
        agentId: runner.agentId,
        origin: publicOrigin(request),
        serverId: runner.serverId,
        triggerId: input.triggerId,
    });
    if ('event' in input) {
        return await previewGithubTrigger(db, runner.serverId, trigger, input);
    }
    return await previewLinearTrigger(services.linear, {
        now: clock.now(),
        payload: input.payload,
        serverId: runner.serverId,
        trigger,
    });
}

export async function updateAgentTrigger(
    db: HausDatabase,
    runner: ResolvedRunner,
    request: FastifyRequest,
    input: AgentTriggerUpdateInput & { triggerId: string },
    services: TriggerAuthoringServices
) {
    const trigger = await updateAgentOwnedTrigger(
        db,
        services,
        runner.agentId,
        { ...input, origin: publicOrigin(request), serverId: runner.serverId },
        clock
    );
    return { trigger: await toAgentTrigger(db, runner.serverId, trigger) };
}

export async function createAgentTrigger(
    db: HausDatabase,
    runner: ResolvedRunner,
    request: FastifyRequest,
    input: AgentTriggerCreateInput,
    services: TriggerAuthoringServices
) {
    const anchor = await resolveAgentMessage(db, runner, input.messageId);
    if (input.kind === 'linear') {
        const created = await createAgentLinearTrigger(
            services.linear,
            runner.agentId,
            {
                anchorChatId: anchor.chat_id,
                anchorMessageId: anchor.id,
                instruction: input.instruction ?? null,
                linear: input.linear,
                origin: publicOrigin(request),
                serverId: runner.serverId,
                title: input.title,
            },
            clock
        );
        return { trigger: await toAgentTrigger(db, runner.serverId, created) };
    }
    if (input.kind === 'github') {
        const created = await createAgentGithubTrigger(
            { db, transport: services.githubTransport },
            runner.agentId,
            {
                anchorChatId: anchor.chat_id,
                anchorMessageId: anchor.id,
                github: input.github,
                instruction: input.instruction ?? null,
                origin: publicOrigin(request),
                serverId: runner.serverId,
                title: input.title,
            },
            clock
        );
        return { trigger: await toAgentTrigger(db, runner.serverId, created) };
    }
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
