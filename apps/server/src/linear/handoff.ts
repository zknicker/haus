import { and, eq, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearIdentitiesTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import {
    agentLabelInTeam,
    agentLabelsByLinearId,
    workspaceCredentialId,
} from './agent-label-reads.ts';
import type { LinearDeliveryRow } from './delivery-handler.ts';
import { readDataChange, strings, text } from './delivery-payload.ts';
import { linearAgentActor } from './handoff-actor.ts';
import { correlateLinearDelivery, type LinearDeliveryCause } from './loop-safety.ts';
import { enqueueLinearOutbox, linearSessionExternalUrls } from './outbox.ts';
import { readSessionWorkspace, type SessionWorkspace } from './session-agents.ts';
import { anchorLinearSession } from './session-anchor.ts';
import { closeLinearSessions } from './sessions.ts';

/** What a handoff changed, for the caller's routed count. */
export type LinearHandoff =
    | { kind: 'none' }
    | { kind: 'defer' }
    | {
          agentId: string;
          /** A DM the handoff's new session anchored on, announced after commit. */
          announce: PreparedRealtimeEvent[];
          cause: LinearDeliveryCause;
          kind: 'handed_off';
      };

/**
 * Detects a handoff on an Issue delivery (specs/linear-app.md#handoff): a
 * person moving the `Agent` label to Agent B, or delegating the issue to B's
 * identity. The previous Agent's open sessions on the issue become
 * `handed_off`, and the outbox brings Linear in line: B's actor as delegate
 * (with a fresh session when it already is), or B's label. A label change the
 * ledger ties to B's own write is already B's doing and enqueues nothing.
 */
export async function detectLinearHandoff(
    tx: HausDatabase,
    row: LinearDeliveryRow,
    now: Date,
    appOrigin: string
): Promise<LinearHandoff> {
    const change = readDataChange(row.body);
    const teamId = text(change?.data, 'teamId');
    if (!(change && teamId && row.event === 'Issue' && change.updatedFrom)) {
        return { kind: 'none' };
    }
    const workspace = await readSessionWorkspace(tx, row.workspaceId);
    if (!workspace) {
        return { kind: 'none' };
    }
    const target = await handoffTarget(tx, workspace, change.data, change.updatedFrom);
    if (!target) {
        return { kind: 'none' };
    }
    const cause = await correlateLinearDelivery(tx, {
        actorId: change.actorId,
        changedAt: change.updatedAt ?? row.webhookTimestamp,
        created: false,
        deferredSince: row.deferredSince,
        entityId: change.entityId,
        now,
        workspaceId: workspace.id,
    });
    if (cause.kind === 'defer') {
        return cause;
    }
    await closeLinearSessions(tx, {
        now,
        serverId: workspace.serverId,
        status: 'handed_off',
        where: {
            exceptAgentId: target.agentId,
            issueId: change.entityId,
            workspaceId: workspace.id,
        },
    });
    const ownWrite = cause.kind === 'agent' && cause.agentId === target.agentId;
    const announce = ownWrite
        ? []
        : await enqueueHandoff(tx, workspace, {
              agentId: target.agentId,
              appOrigin,
              delegateId: text(change.data, 'delegateId'),
              issueId: change.entityId,
              now,
              reason: target.reason,
              teamId,
          });
    return { agentId: target.agentId, announce, cause, kind: 'handed_off' };
}

/**
 * Identity removal hands each open issue delegated to that identity back to
 * its Agent through the Haus app. The removal transaction cannot read Linear,
 * so the outbox worker lists the issues with the workspace token; the `Agent`
 * label already names the Agent, so only the delegate changes.
 */
export async function handBackIdentityIssues(
    tx: HausDatabase,
    input: { identityUserId: string; now: Date; workspaceId: string }
): Promise<void> {
    const workspace = await readSessionWorkspace(tx, input.workspaceId);
    const credentialId = workspace ? await workspaceCredentialId(tx, workspace.id) : null;
    if (!(workspace && credentialId)) {
        return;
    }
    await enqueueLinearOutbox(
        tx,
        {
            credentialId,
            input: { delegateId: workspace.appUserId, identityUserId: input.identityUserId },
            kind: 'identity_hand_back',
            serverId: workspace.serverId,
            workspaceId: workspace.id,
        },
        input.now
    );
}

/** B, and whether a person moved B's label onto the issue or delegated to B's identity. */
async function handoffTarget(
    tx: HausDatabase,
    workspace: SessionWorkspace,
    data: Record<string, unknown>,
    previous: Record<string, unknown>
): Promise<{ agentId: string; reason: 'delegate' | 'label' } | null> {
    if ('labelIds' in previous) {
        const before = new Set(strings(previous, 'labelIds'));
        const added = strings(data, 'labelIds').filter((id) => !before.has(id));
        const [label] = await agentLabelsByLinearId(tx, workspace.id, added);
        if (label) {
            return { agentId: label.agentId, reason: 'label' };
        }
    }
    const delegateId = text(data, 'delegateId');
    if ('delegateId' in previous && delegateId) {
        const [identity] = await tx
            .select({ agentId: linearIdentitiesTable.agentId })
            .from(linearIdentitiesTable)
            .where(
                and(
                    eq(linearIdentitiesTable.workspaceId, workspace.id),
                    eq(linearIdentitiesTable.appUserId, delegateId),
                    ne(linearIdentitiesTable.status, 'removed')
                )
            )
            .limit(1);
        if (identity) {
            return { agentId: identity.agentId, reason: 'delegate' };
        }
    }
    return null;
}

async function enqueueHandoff(
    tx: HausDatabase,
    workspace: SessionWorkspace,
    input: {
        agentId: string;
        appOrigin: string;
        delegateId: string | null;
        issueId: string;
        now: Date;
        reason: 'delegate' | 'label';
        teamId: string;
    }
): Promise<PreparedRealtimeEvent[]> {
    const workspaceCredential = await workspaceCredentialId(tx, workspace.id);
    if (!workspaceCredential) {
        return [];
    }
    const base = { serverId: workspace.serverId, workspaceId: workspace.id };
    if (input.reason === 'delegate') {
        const labelId = await agentLabelInTeam(tx, { ...input, workspaceId: workspace.id });
        if (labelId) {
            await enqueueLinearOutbox(
                tx,
                {
                    ...base,
                    credentialId: workspaceCredential,
                    input: {
                        delegateId: null,
                        issueId: input.issueId,
                        labelId,
                        removeLabelIds: [],
                    },
                    kind: 'issue_route',
                },
                input.now
            );
        }
        return [];
    }
    const actor = await linearAgentActor(tx, workspace, {
        agentId: input.agentId,
        teamId: input.teamId,
    });
    if (actor.appUserId === input.delegateId) {
        // Already B's actor: Linear starts no session by itself, so Haus opens one.
        const anchor = await anchorLinearSession(tx, { ...base, agentId: input.agentId });
        if (!anchor) {
            return [];
        }
        await enqueueLinearOutbox(
            tx,
            {
                ...base,
                credentialId: actor.credentialId ?? workspaceCredential,
                input: {
                    externalUrls: linearSessionExternalUrls({
                        appOrigin: input.appOrigin,
                        chatId: anchor.chatId,
                        serverSlug: workspace.slug,
                    }),
                    issueId: input.issueId,
                },
                kind: 'session_create',
            },
            input.now
        );
        return anchor.announce ? [anchor.announce] : [];
    }
    await enqueueLinearOutbox(
        tx,
        {
            ...base,
            credentialId: workspaceCredential,
            input: {
                delegateId: actor.appUserId,
                issueId: input.issueId,
                labelId: null,
                removeLabelIds: [],
            },
            kind: 'issue_route',
        },
        input.now
    );
    return [];
}
