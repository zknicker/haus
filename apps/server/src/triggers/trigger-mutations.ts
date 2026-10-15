import type {
    AgentTriggerUpdateInput,
    GithubTrigger,
    GithubTriggerConfigInput,
    Trigger,
    TriggerStatus,
    WebhookTrigger,
} from '@haus/api';
import { requireChatWritable } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { requireActiveAgent, requireAgentAnchor } from '../reminders/reminder-model.ts';
import type { GithubAuthoringDependencies } from './github-trigger-config.ts';
import { createGithubTriggerRow, updateGithubTriggerRow } from './github-trigger-writes.ts';
import { refuseLinearTriggers, type TriggerClock } from './trigger-model.ts';
import { readOwnedTrigger } from './trigger-queries.ts';
import {
    createTriggerRow,
    deleteTriggerRow,
    rotateTriggerSecretRow,
    setTriggerStatusRow,
    type TriggerAnchor,
    updateTriggerRow,
} from './trigger-writes.ts';

/**
 * The Agent's own trigger mutations. Authorization is ownership plus continued
 * access to the anchor; the row work itself is the shared core in
 * `trigger-writes.ts`, which the operator path uses with its own check.
 */

export interface CreateTriggerInput {
    anchorChatId: string;
    anchorMessageId: string;
    instruction: string | null;
    kind: 'webhook';
    origin: string;
    serverId: string;
    title: string;
}

/**
 * Creates one armed trigger for the calling Agent, anchored to a message it can
 * already reach. The minted secret is returned once and never stored in the
 * clear.
 */
export async function createTrigger(
    db: HausDatabase,
    agentId: string,
    input: CreateTriggerInput,
    clock: TriggerClock
): Promise<{ secret: string; trigger: WebhookTrigger }> {
    return await createTriggerRow(
        db,
        {
            createdByUserId: null,
            instruction: input.instruction,
            kind: input.kind,
            origin: input.origin,
            ownerAgentId: agentId,
            serverId: input.serverId,
            title: input.title,
        },
        (tx) => anchorOnAskingMessage(tx, agentId, input),
        clock
    );
}

/**
 * Creates one armed `github` Trigger for the calling Agent, anchored like a
 * webhook on the message where a person asked for it. It has no secret.
 */
export async function createAgentGithubTrigger(
    dependencies: GithubAuthoringDependencies,
    agentId: string,
    input: Omit<CreateTriggerInput, 'kind'> & { github: GithubTriggerConfigInput },
    clock: TriggerClock
): Promise<GithubTrigger> {
    const created = await createGithubTriggerRow(
        dependencies,
        {
            createdByUserId: null,
            github: input.github,
            instruction: input.instruction,
            origin: input.origin,
            ownerAgentId: agentId,
            serverId: input.serverId,
            title: input.title,
        },
        (tx) => anchorOnAskingMessage(tx, agentId, input),
        clock
    );
    return created.trigger;
}

/** The Agent is active and can still reach and write the message it anchors on. */
async function anchorOnAskingMessage(
    tx: HausDatabase,
    agentId: string,
    input: { anchorChatId: string; anchorMessageId: string; serverId: string }
): Promise<TriggerAnchor> {
    await requireActiveAgent(tx, input.serverId, agentId);
    await requireAgentAnchor(tx, {
        agentId,
        anchorChatId: input.anchorChatId,
        anchorMessageId: input.anchorMessageId,
        serverId: input.serverId,
    });
    await requireChatWritable(tx, { chatId: input.anchorChatId, serverId: input.serverId });
    return { chatId: input.anchorChatId, messageId: input.anchorMessageId };
}

/**
 * Arms or disables one of the calling Agent's own triggers. A problem found on
 * arming is on the returned Trigger, and its notice waits in the Agent's own
 * inbox, so the running Agent needs no separate wake.
 */
export async function setTriggerStatus(
    db: HausDatabase,
    agentId: string,
    input: { origin: string; serverId: string; status: TriggerStatus; triggerId: string },
    clock: TriggerClock
): Promise<Trigger> {
    return (await setTriggerStatusRow(db, input, ownedBy(agentId, input), clock)).trigger;
}

/** Replaces the bearer secret. The previous secret stops working immediately. */
export async function rotateTriggerSecret(
    db: HausDatabase,
    agentId: string,
    input: { origin: string; serverId: string; triggerId: string },
    clock: TriggerClock
): Promise<{ secret: string; trigger: WebhookTrigger }> {
    return await rotateTriggerSecretRow(db, input, ownedBy(agentId, input), clock);
}

/** Removes one Trigger from active use while retaining its recent fire history. */
export async function deleteTrigger(
    db: HausDatabase,
    agentId: string,
    input: { origin: string; serverId: string; triggerId: string },
    clock: TriggerClock
): Promise<void> {
    await deleteTriggerRow(db, input, ownedBy(agentId, input), clock);
}

export async function updateAgentOwnedTrigger(
    dependencies: GithubAuthoringDependencies,
    agentId: string,
    input: AgentTriggerUpdateInput & { origin: string; serverId: string; triggerId: string },
    clock: TriggerClock
): Promise<Trigger> {
    const authorize = ownedBy(agentId, input);
    await authorize(dependencies.db);
    if (input.linear) {
        refuseLinearTriggers();
    }
    if (input.github) {
        return await updateGithubTriggerRow(
            dependencies,
            { ...input, github: input.github },
            authorize,
            clock
        );
    }
    return await updateTriggerRow(dependencies.db, input, authorize, clock);
}

/** The Agent authorization every verb shares: it owns the row and can still reach the anchor. */
function ownedBy(agentId: string, input: { origin: string; serverId: string; triggerId: string }) {
    return async (tx: HausDatabase) =>
        await readOwnedTrigger(tx, {
            agentId,
            origin: input.origin,
            serverId: input.serverId,
            triggerId: input.triggerId,
        });
}
