import type { LinearTriggerPreviewInput, Trigger } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { text } from '../linear/delivery-payload.ts';
import { linearTriggerEvent } from '../linear/event-projection/project.ts';
import { LinearApiError } from '../linear/linear-api.ts';
import { LinearRefusedError } from '../linear/linear-errors.ts';
import { readCommentIssueFor } from '../linear/trigger-delivery.ts';
import { matchLinearTrigger } from '../linear/trigger-matching.ts';
import { commentIssueId, projectForMatching } from '../linear/trigger-projection.ts';
import { linearTriggerConfigsTable } from '../postgres/schema.ts';
import type { LinearAuthoringDependencies } from './linear-trigger-config.ts';
import { requireLinearTrigger } from './linear-trigger-writes.ts';
import { TriggerRequestRefusedError } from './trigger-model.ts';

export interface LinearTriggerPreview {
    groups: number[];
    matched: boolean;
    reason?: string;
}

/**
 * Selection preview over a caller-supplied raw Linear webhook body
 * (specs/linear-triggers.md#preview). The body is projected and matched
 * exactly as a delivery would be — team access, the ledger's Agent actor, the
 * `Agent` label's delegate, self-suppression — but nothing is recorded, no
 * budget is spent, and no Agent wakes. Workspace and Trigger status, rate
 * limits, and the chain budget are not consulted.
 */
export async function previewLinearTrigger(
    dependencies: LinearAuthoringDependencies,
    input: LinearTriggerPreviewInput & { now: Date; serverId: string; trigger: Trigger }
): Promise<LinearTriggerPreview> {
    const { db } = dependencies;
    const trigger = requireLinearTrigger(input.trigger);
    const [config] = await db
        .select({ workspaceId: linearTriggerConfigsTable.workspaceId })
        .from(linearTriggerConfigsTable)
        .where(
            and(
                eq(linearTriggerConfigsTable.serverId, input.serverId),
                eq(linearTriggerConfigsTable.triggerId, trigger.id)
            )
        )
        .limit(1);
    if (!config) {
        throw new Error(`Linear Trigger ${trigger.id} has no stored configuration.`);
    }
    const body = input.payload;
    const event = linearTriggerEvent(text(body, 'type') ?? '');
    if (!event) {
        return { groups: [], matched: false, reason: 'unsupported_event' };
    }
    const issueId = event === 'comment' ? commentIssueId(body) : null;
    const listensToComments = trigger.linear.groups.some((group) => group.event === 'comment');
    const commentIssue =
        issueId && listensToComments
            ? await readIssueForPreview(dependencies, config.workspaceId, issueId)
            : null;
    const timestamp = Number(body.webhookTimestamp);
    const projected = await projectForMatching(db, {
        body,
        commentIssue,
        deferredSince: null,
        event,
        forceDecision: true,
        now: input.now,
        webhookTimestamp: Number.isFinite(timestamp) ? new Date(timestamp) : input.now,
        workspaceId: config.workspaceId,
    });
    if (projected.kind !== 'projected') {
        return { groups: [], matched: false, reason: 'unreadable_payload' };
    }
    const match = matchLinearTrigger(trigger.linear.groups, projected.projection, {
        accessTeamIds: projected.accessTeamIds,
        ownerAgentId: trigger.ownerAgentId,
    });
    if (match.kind === 'matched') {
        return { groups: match.groups, matched: true };
    }
    return match.kind === 'own_change'
        ? { groups: match.groups, matched: false, reason: 'own_change' }
        : { groups: [], matched: false, reason: match.reason };
}

/** A comment's issue for preview; a Linear failure is a refusal the caller can retry. */
async function readIssueForPreview(
    dependencies: LinearAuthoringDependencies,
    workspaceId: string,
    issueId: string
) {
    try {
        return await readCommentIssueFor(dependencies, workspaceId, issueId);
    } catch (cause) {
        if (cause instanceof LinearRefusedError || cause instanceof LinearApiError) {
            throw new TriggerRequestRefusedError(
                'linear_reference_unavailable',
                'Linear did not answer the read of the comment’s issue. Reconnect Linear if it needs sign-in, or try again shortly.'
            );
        }
        throw cause;
    }
}
