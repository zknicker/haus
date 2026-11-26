import type { TaskActor } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable } from '../postgres/schema.ts';
import type { TaskSessionChoice } from './task-session-choice.ts';

/**
 * The Task's hidden agent (ADR 0062 decision 3): kind `task`, a Server-minted handle, no home
 * Project, and its Task's Machine and model. Delivery runs it on that Machine; its access is
 * never its own (`computer-access/agent-access.ts`).
 */
export async function insertTaskAgent(
    tx: Pick<HausDatabase, 'insert'>,
    input: {
        session: TaskSessionChoice;
        serverId: string;
        shortId: string;
        starter: TaskActor;
        title: string;
    }
) {
    const id = createOpaqueId('agt');
    await tx.insert(agentsTable).values({
        computerId: input.session.computerId,
        createdByAgentId: input.starter.kind === 'agent' ? input.starter.agentId : null,
        createdByUserId: input.starter.kind === 'user' ? input.starter.userId : null,
        desiredModelId: input.session.modelId,
        desiredReasoningEffort: 'default',
        desiredRuntimeId: input.session.runtimeId,
        displayName: input.title,
        handle: taskAgentHandle(input.shortId),
        homeProjectId: null,
        homeTimezone: 'UTC',
        id,
        kind: 'task',
        serverId: input.serverId,
    });
    return id;
}

export function taskAgentHandle(shortId: string) {
    return `task-${shortId}`;
}
